const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const prisma = require("../db");
const { getConfig, updateConfig } = require("../services/configService");
const { logAction } = require("../services/logService");
const { buildRulesMessage } = require("../services/rulesService");
const {
  CUSTOM_IDS,
  INTRO_TEMPLATE,
  BOT_HELP_MESSAGE,
  BOT_CONTACT_MESSAGE
} = require("../constants");
const {
  requireAdmin,
  requireModerator,
  targetIsSelf,
  targetIsBot,
  actorCanManageTarget,
  botCanManageTarget
} = require("../utils/permissions");
const { safeRoleAdd, safeRoleRemove, safeSend } = require("../utils/discord");
const { buildStatus, maybeCompleteOnboarding } = require("../services/onboardingService");
const { warnMember, createReport, removeMember, timeoutMember } = require("../services/moderationService");
const { addPrompt, postTodayPrompt, isValidPromptTime } = require("../services/promptService");
const {
  BOT_INTRO_DM,
  sendBotIntroToMember,
  startCampaign,
  stopCampaign,
  getStatus,
  optOut,
  resetUser,
  postAnnouncement
} = require("../services/botIntroService");
const {
  saveCurrentChannelScan,
  setMonitorAllChannels,
  getMonitoringStatus
} = require("../services/channelMonitorService");

async function handleCommand(interaction) {
  if (interaction.commandName === "setup") return handleSetup(interaction);
  if (interaction.commandName === "rules-post") return handleRulesPost(interaction);
  if (interaction.commandName === "intro-template") return handleIntroTemplate(interaction);
  if (interaction.commandName === "intro-check") return handleIntroCheck(interaction);
  if (interaction.commandName === "approve") return handleApprove(interaction);
  if (interaction.commandName === "remove") return handleRemove(interaction);
  if (interaction.commandName === "warn") return handleWarn(interaction);
  if (interaction.commandName === "timeout") return handleTimeout(interaction);
  if (interaction.commandName === "report") return handleReport(interaction);
  if (interaction.commandName === "prompt") return handlePrompt(interaction);
  if (interaction.commandName === "bot-intro") return handleBotIntro(interaction);
  if (interaction.commandName === "bot") return handleBot(interaction);
  if (interaction.commandName === "monitor") return handleMonitor(interaction);
}

async function handleSetup(interaction) {
  const denied = requireAdmin(interaction);
  if (denied) return denied;

  const fields = {
    welcomeChannelId: interaction.options.getChannel("welcome_channel")?.id,
    rulesChannelId: interaction.options.getChannel("rules_channel")?.id,
    introChannelId: interaction.options.getChannel("intro_channel")?.id,
    modLogChannelId: interaction.options.getChannel("mod_log_channel")?.id,
    reportsChannelId: interaction.options.getChannel("reports_channel")?.id,
    dailyPromptChannelId: interaction.options.getChannel("daily_prompt_channel")?.id,
    newArrivalRoleId: interaction.options.getRole("new_arrival_role")?.id,
    rulesAcceptedRoleId: interaction.options.getRole("rules_accepted_role")?.id,
    saloonMemberRoleId: interaction.options.getRole("saloon_member_role")?.id,
    mutedRoleId: interaction.options.getRole("muted_role")?.id,
    quarantinedRoleId: interaction.options.getRole("quarantined_role")?.id,
    antiSpamEnabled: interaction.options.getBoolean("anti_spam_enabled"),
    quarantineEnabled: interaction.options.getBoolean("quarantine_enabled"),
    includeModeratorsInBotIntroDM: interaction.options.getBoolean("include_mods_in_intro_dm"),
    inviteBlocklist: interaction.options.getString("invite_blocklist"),
    suspiciousLinkBlocklist: interaction.options.getString("suspicious_link_blocklist")
  };
  const data = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null));
  const config = await updateConfig(interaction.guildId, data);
  await logAction(interaction.guild, "SETUP_UPDATED", { moderatorId: interaction.user.id, metadata: data });
  const hierarchyWarnings = buildHierarchyWarnings(interaction.guild, config);
  await interaction.reply({
    content: [
      `Setup saved for Poly Saloon Gatekeeper.`,
      `Configured fields: ${Object.keys(data).join(", ") || "none changed"}`,
      hierarchyWarnings.length ? `Role hierarchy warnings:\n${hierarchyWarnings.join("\n")}` : null
    ].filter(Boolean).join("\n"),
    ephemeral: true
  });
  return config;
}

async function handleRulesPost(interaction) {
  const denied = requireAdmin(interaction);
  if (denied) return denied;
  const config = await getConfig(interaction.guildId);
  const channel = config.rulesChannelId
    ? await interaction.guild.channels.fetch(config.rulesChannelId).catch(() => null)
    : interaction.channel;
  if (!channel) {
    return interaction.reply({ content: "I could not find the rules channel. Run /setup first.", ephemeral: true });
  }
  await channel.send(buildRulesMessage());
  await logAction(interaction.guild, "RULES_POSTED", {
    moderatorId: interaction.user.id,
    metadata: { channelId: channel.id }
  });
  await interaction.reply({ content: "Rules posted with the agreement button.", ephemeral: true });
}

async function handleIntroTemplate(interaction) {
  await safeSend(interaction.user, { content: INTRO_TEMPLATE });
  await interaction.reply({ content: `Here is the intro template:\n\n${INTRO_TEMPLATE}`, ephemeral: true });
}

async function handleIntroCheck(interaction) {
  const denied = requireModerator(interaction);
  if (denied) return denied;
  const user = interaction.options.getUser("user", true);
  const status = await buildStatus(interaction.guildId, user.id);
  await interaction.reply({ content: status, ephemeral: true });
}

async function handleApprove(interaction) {
  const denied = requireModerator(interaction);
  if (denied) return denied;
  const user = interaction.options.getUser("user", true);
  if (targetIsBot(user)) {
    await logAction(interaction.guild, "MANUAL_APPROVAL_REJECTED", {
      userId: user.id,
      moderatorId: interaction.user.id,
      reason: "Bot accounts do not need onboarding approval."
    });
    return interaction.reply({ content: "Bot accounts do not need onboarding approval.", ephemeral: true });
  }
  const member = await interaction.guild.members.fetch(user.id);
  const config = await getConfig(interaction.guildId);
  await prisma.onboardingUser.upsert({
    where: { guildId_userId: { guildId: interaction.guildId, userId: user.id } },
    update: { rulesAccepted: true, introCompleted: true, introValidationStatus: "manual_approval" },
    create: {
      guildId: interaction.guildId,
      userId: user.id,
      username: user.tag,
      joinedAt: member.joinedAt ?? new Date(),
      introDeadline: new Date(),
      rulesAccepted: true,
      introCompleted: true,
      introValidationStatus: "manual_approval"
    }
  });
  const removedNewArrival = await safeRoleRemove(member, config.newArrivalRoleId);
  const addedRulesAccepted = await safeRoleAdd(member, config.rulesAcceptedRoleId);
  const addedSaloonMember = await safeRoleAdd(member, config.saloonMemberRoleId);
  await maybeCompleteOnboarding(member);
  const roleFailures = [
    config.newArrivalRoleId && !removedNewArrival && member.roles.cache.has(config.newArrivalRoleId) ? "remove New Arrival" : null,
    config.rulesAcceptedRoleId && !addedRulesAccepted && !member.roles.cache.has(config.rulesAcceptedRoleId) ? "add Rules Accepted" : null,
    config.saloonMemberRoleId && !addedSaloonMember && !member.roles.cache.has(config.saloonMemberRoleId) ? "add Saloon Member" : null
  ].filter(Boolean);
  await logAction(interaction.guild, roleFailures.length ? "MANUAL_APPROVAL_ROLE_FAILURE" : "MANUAL_APPROVAL", {
    userId: user.id,
    moderatorId: interaction.user.id,
    metadata: roleFailures.length ? { roleFailures } : undefined
  });
  await interaction.reply({
    content: roleFailures.length
      ? `${user} was marked approved in the database, but I could not ${roleFailures.join(", ")}. Check my role hierarchy.`
      : `${user} has been approved.`,
    ephemeral: true
  });
}

async function handleRemove(interaction) {
  const denied = requireModerator(interaction);
  if (denied) return denied;
  const user = interaction.options.getUser("user", true);
  if (targetIsSelf(interaction.user.id, user.id)) {
    await logAction(interaction.guild, "MEMBER_REMOVE_REJECTED", {
      userId: user.id,
      moderatorId: interaction.user.id,
      reason: "Moderator tried to remove themselves."
    });
    return interaction.reply({ content: "You cannot remove yourself with this command.", ephemeral: true });
  }
  if (targetIsBot(user)) {
    await logAction(interaction.guild, "MEMBER_REMOVE_REJECTED", {
      userId: user.id,
      moderatorId: interaction.user.id,
      reason: "Moderator tried to remove a bot account."
    });
    return interaction.reply({ content: "I will not remove bot accounts with this command.", ephemeral: true });
  }
  const reason = interaction.options.getString("reason", true);
  const member = await interaction.guild.members.fetch(user.id);
  await removeMember(member, interaction.user.id, reason);
  await interaction.reply({ content: `${user} was removed and logged.`, ephemeral: true });
}

async function handleWarn(interaction) {
  const denied = requireModerator(interaction);
  if (denied) return denied;
  const user = interaction.options.getUser("user", true);
  if (targetIsSelf(interaction.user.id, user.id)) {
    await logAction(interaction.guild, "WARNING_REJECTED", {
      userId: user.id,
      moderatorId: interaction.user.id,
      reason: "Moderator tried to warn themselves."
    });
    return interaction.reply({ content: "You cannot warn yourself with this command.", ephemeral: true });
  }
  if (targetIsBot(user)) {
    await logAction(interaction.guild, "WARNING_REJECTED", {
      userId: user.id,
      moderatorId: interaction.user.id,
      reason: "Moderator tried to warn a bot account."
    });
    return interaction.reply({ content: "I will not warn bot accounts with this command.", ephemeral: true });
  }
  const reason = interaction.options.getString("reason", true);
  const targetMember = await interaction.guild.members.fetch(user.id);
  if (!actorCanManageTarget(interaction.member, targetMember)) {
    await logAction(interaction.guild, "WARNING_REJECTED", {
      userId: user.id,
      moderatorId: interaction.user.id,
      reason: "Moderator role is not above target member role."
    });
    return interaction.reply({ content: "You cannot warn a member with an equal or higher role.", ephemeral: true });
  }
  await warnMember(interaction.guild, interaction.user.id, user, reason);
  await interaction.reply({ content: `${user} was warned and logged.`, ephemeral: true });
}

async function handleTimeout(interaction) {
  const denied = requireModerator(interaction);
  if (denied) return denied;
  const user = interaction.options.getUser("user", true);
  if (targetIsSelf(interaction.user.id, user.id)) {
    await logAction(interaction.guild, "TIMEOUT_REJECTED", {
      userId: user.id,
      moderatorId: interaction.user.id,
      reason: "Moderator tried to timeout themselves."
    });
    return interaction.reply({ content: "You cannot timeout yourself with this command.", ephemeral: true });
  }
  if (targetIsBot(user)) {
    await logAction(interaction.guild, "TIMEOUT_REJECTED", {
      userId: user.id,
      moderatorId: interaction.user.id,
      reason: "Moderator tried to timeout a bot account."
    });
    return interaction.reply({ content: "I will not timeout bot accounts with this command.", ephemeral: true });
  }
  const duration = interaction.options.getString("duration", true);
  const reason = interaction.options.getString("reason", true);
  const member = await interaction.guild.members.fetch(user.id);
  await timeoutMember(member, interaction.user.id, duration, reason);
  await interaction.reply({ content: `${user} has been timed out for ${duration}.`, ephemeral: true });
}

async function handleReport(interaction) {
  const user = interaction.options.getUser("user", true);
  if (targetIsSelf(interaction.user.id, user.id)) {
    return interaction.reply({ content: "You cannot report yourself. Please report the member involved.", ephemeral: true });
  }
  if (targetIsBot(user)) {
    return interaction.reply({ content: "Please report bot problems directly to moderators.", ephemeral: true });
  }
  const reason = interaction.options.getString("reason", true);
  await createReport(interaction.guild, interaction.user.id, user.id, reason);
  await interaction.reply({ content: "Thank you. Your report was sent privately to the moderation team.", ephemeral: true });
}

async function handlePrompt(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "today") {
    const denied = requireModerator(interaction);
    if (denied) return denied;
    const result = await postTodayPrompt(interaction.guild, { moderatorId: interaction.user.id });
    await logAction(interaction.guild, "PROMPT_TODAY_REQUESTED", {
      moderatorId: interaction.user.id,
      metadata: result
    });
    const message = result.posted
      ? "Today's Poly Saloon prompt has been posted."
      : result.reason === "already_posted"
        ? "Today's prompt was already posted. I skipped it to avoid a duplicate."
        : "I could not post today's prompt. Check that the daily prompt channel is configured.";
    return interaction.reply({ content: message, ephemeral: true });
  }

  if (sub === "add") {
    const denied = requireModerator(interaction);
    if (denied) return denied;
    const theme = interaction.options.getString("theme", true);
    const text = interaction.options.getString("text", true);
    await addPrompt(interaction.guildId, theme, text, interaction.user.id);
    await logAction(interaction.guild, "PROMPT_ADDED", {
      moderatorId: interaction.user.id,
      metadata: { theme, text }
    });
    return interaction.reply({ content: `Prompt added to ${theme}.`, ephemeral: true });
  }

  if (sub === "schedule") {
    const denied = requireAdmin(interaction);
    if (denied) return denied;
    const enabled = interaction.options.getBoolean("enabled", true);
    const time = interaction.options.getString("time") ?? undefined;
    if (time && !isValidPromptTime(time)) {
      return interaction.reply({ content: "Use valid 24-hour time like 09:00 or 18:30.", ephemeral: true });
    }
    await updateConfig(interaction.guildId, {
      dailyPromptEnabled: enabled,
      ...(time ? { dailyPromptTime: time } : {})
    });
    await logAction(interaction.guild, "PROMPT_SCHEDULE_UPDATED", {
      moderatorId: interaction.user.id,
      metadata: { enabled, time }
    });
    return interaction.reply({ content: `Daily prompts are now ${enabled ? "on" : "off"}${time ? ` at ${time}` : ""}.`, ephemeral: true });
  }
}

async function handleBotIntro(interaction) {
  const sub = interaction.options.getSubcommand();

  if (["preview", "send-test", "status"].includes(sub)) {
    const denied = requireModerator(interaction);
    if (denied) return denied;
  }
  if (["start", "stop", "reset-user"].includes(sub)) {
    const denied = requireAdmin(interaction);
    if (denied) return denied;
  }

  if (sub === "preview") {
    return interaction.reply({ content: BOT_INTRO_DM, ephemeral: true });
  }

  if (sub === "send-test") {
    const user = interaction.options.getUser("user", true);
    if (targetIsBot(user)) {
      await logAction(interaction.guild, "BOT_INTRO_DM_TEST_REJECTED", {
        userId: user.id,
        moderatorId: interaction.user.id,
        reason: "Bot intro test DMs are not sent to bot accounts."
      });
      return interaction.reply({ content: "I will not send bot intro DMs to bot accounts.", ephemeral: true });
    }
    const member = await interaction.guild.members.fetch(user.id);
    const result = await sendBotIntroToMember(member, { moderatorId: interaction.user.id });
    return interaction.reply({
      content: `Test DM result for ${user}: ${result.status}${result.reason ? ` (${result.reason})` : ""}`,
      ephemeral: true
    });
  }

  if (sub === "start") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.CONFIRM_BOT_INTRO_START)
        .setStyle(ButtonStyle.Danger)
        .setLabel("Yes, send the one-time bot introduction DM.")
    );
    return interaction.reply({
      content: "This will post a public server announcement, then slowly DM eligible existing members one time only. Please confirm.",
      components: [row],
      ephemeral: true
    });
  }

  if (sub === "status") {
    const status = await getStatus(interaction.guild);
    return interaction.reply({
      content: [
        `Bot introduction DM status:`,
        `Total eligible members: ${status.totalEligible}`,
        `Sent: ${status.sent}`,
        `Failed: ${status.failed}`,
        `Skipped: ${status.skipped}`,
        `Opted out: ${status.optedOut}`,
        `Remaining: ${status.remaining}`,
        `Campaign running: ${status.running ? "yes" : "no"}`
      ].join("\n"),
      ephemeral: true
    });
  }

  if (sub === "stop") {
    const stopped = await stopCampaign(interaction.guildId);
    await logAction(interaction.guild, stopped ? "BOT_INTRO_DM_STOP_REQUESTED" : "BOT_INTRO_DM_STOP_NOOP", {
      moderatorId: interaction.user.id
    });
    return interaction.reply({
      content: stopped ? "The bot intro DM campaign is stopping safely." : "No bot intro DM campaign is currently running.",
      ephemeral: true
    });
  }

  if (sub === "reset-user") {
    const user = interaction.options.getUser("user", true);
    await resetUser(interaction.guildId, user.id);
    await logAction(interaction.guild, "BOT_INTRO_DM_USER_RESET", {
      userId: user.id,
      moderatorId: interaction.user.id
    });
    return interaction.reply({ content: `Bot intro DM log reset for ${user}.`, ephemeral: true });
  }
}

async function handleBot(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "help") {
    return interaction.reply({ content: BOT_HELP_MESSAGE, ephemeral: true });
  }
  if (sub === "contact") {
    return interaction.reply({ content: BOT_CONTACT_MESSAGE, ephemeral: true });
  }
  if (sub === "optout-dms") {
    await optOut(interaction.guildId, interaction.user.id);
    await logAction(interaction.guild, "BOT_INTRO_DM_OPT_OUT", { userId: interaction.user.id });
    return interaction.reply({
      content: "You are opted out of non-critical bot DMs. Critical moderation or safety notices may still be sent when needed.",
      ephemeral: true
    });
  }
}

async function handleMonitor(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "status") {
    const denied = requireModerator(interaction);
    if (denied) return denied;
    const status = await getMonitoringStatus(interaction.guild);
    return interaction.reply({
      content: [
        "Channel monitoring status:",
        `Anti-spam enabled: ${status.antiSpamEnabled ? "yes" : "no"}`,
        `Dynamic all-channel monitoring: ${status.monitorAllChannels ? "yes" : "no"}`,
        `Saved monitored channels: ${status.scannedCount}`,
        `Saved channels still readable: ${status.scannedStillReadableCount}`,
        `Current readable text channels: ${status.currentReadableCount}`,
        `Excluded channels: ${status.excludedCount}`
      ].join("\n"),
      ephemeral: true
    });
  }

  const denied = requireAdmin(interaction);
  if (denied) return denied;

  if (sub === "scan") {
    const includeLogChannels = interaction.options.getBoolean("include_logs") ?? false;
    const channels = await saveCurrentChannelScan(interaction.guild, { includeLogChannels });
    await logAction(interaction.guild, "CHANNEL_MONITOR_SCAN_SAVED", {
      moderatorId: interaction.user.id,
      metadata: {
        count: channels.length,
        includeLogChannels,
        channelIds: channels.map((channel) => channel.id)
      }
    });
    return interaction.reply({
      content: `Saved ${channels.length} current readable text channels for monitoring. Anti-spam still only runs when /setup anti_spam_enabled:true is set.`,
      ephemeral: true
    });
  }

  if (sub === "all") {
    const enabled = interaction.options.getBoolean("enabled", true);
    await setMonitorAllChannels(interaction.guildId, enabled);
    await logAction(interaction.guild, "CHANNEL_MONITOR_ALL_UPDATED", {
      moderatorId: interaction.user.id,
      metadata: { enabled }
    });
    return interaction.reply({
      content: `Dynamic all-channel monitoring is now ${enabled ? "on" : "off"}. Mod-log and reports channels remain excluded by default.`,
      ephemeral: true
    });
  }
}

async function handleBotIntroStartConfirmation(interaction) {
  const denied = requireAdmin(interaction);
  if (denied) return denied;

  await interaction.update({
    content: "Starting the one-time bot introduction DM campaign. I will send slowly and log every result.",
    components: []
  });
  const announcement = await postAnnouncement(interaction.channel);
  if (!announcement) {
    await logAction(interaction.guild, "BOT_INTRO_DM_ANNOUNCEMENT_FAILED", {
      moderatorId: interaction.user.id,
      reason: "Could not post the public announcement in this channel."
    });
    return interaction.followUp({
      content: "I could not post the public announcement in this channel, so I did not start the DM campaign.",
      ephemeral: true
    });
  }
  const result = await startCampaign(interaction.guild, interaction.user.id);
  await interaction.followUp({
    content: result.started
      ? `Campaign started with ${result.queued} eligible members queued.`
      : `Campaign is already running with ${result.queued} members still queued.`,
    ephemeral: true
  });
}

function buildHierarchyWarnings(guild, config) {
  const warnings = [];
  const roleFields = [
    ["New Arrival", config.newArrivalRoleId],
    ["Rules Accepted", config.rulesAcceptedRoleId],
    ["Saloon Member", config.saloonMemberRoleId],
    ["Muted", config.mutedRoleId],
    ["Quarantined", config.quarantinedRoleId]
  ];

  for (const [name, roleId] of roleFields) {
    const role = roleId ? guild.roles.cache.get(roleId) : null;
    if (role && !botCanManageTarget(guild, { roles: { highest: role } })) {
      warnings.push(`- My bot role is not above ${name}. I may not be able to manage it.`);
    }
  }

  return warnings;
}

module.exports = { handleCommand, handleBotIntroStartConfirmation };
