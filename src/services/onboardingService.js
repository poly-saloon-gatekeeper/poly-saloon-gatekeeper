const prisma = require("../db");
const { getConfig } = require("./configService");
const { logAction } = require("./logService");
const { INTRO_LABELS, WELCOME_MESSAGE } = require("../constants");
const { safeSend, safeRoleAdd, safeRoleRemove, channelMention } = require("../utils/discord");

function missingIntroLabels(content) {
  const normalized = content.toLowerCase();
  return INTRO_LABELS.filter((label) => !normalized.includes(label.toLowerCase()));
}

function extractAge(content) {
  const ageLine = content.split(/\r?\n/)
    .find((line) => line.toLowerCase().includes("age:"));
  if (!ageLine) return null;
  const match = ageLine.match(/\b(\d{1,3})\b/);
  return match ? Number(match[1]) : null;
}

function validateIntro(content) {
  const missing = missingIntroLabels(content);
  const age = extractAge(content);

  if (missing.length) {
    return { ok: false, status: "missing_fields", missing, age };
  }

  if (!Number.isInteger(age)) {
    return { ok: false, status: "age_unclear", missing: [], age };
  }

  if (age < 18) {
    return { ok: false, status: "underage", missing: [], age };
  }

  return { ok: true, status: "complete", missing: [], age };
}

async function handleMemberJoin(member) {
  if (member.user.bot) return;
  const config = await getConfig(member.guild.id);
  const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.onboardingUser.upsert({
    where: { guildId_userId: { guildId: member.guild.id, userId: member.id } },
    update: {
      username: member.user.tag,
      joinedAt: new Date(),
      introDeadline: deadline,
      removedAt: null,
      removalReason: null
    },
    create: {
      guildId: member.guild.id,
      userId: member.id,
      username: member.user.tag,
      joinedAt: new Date(),
      introDeadline: deadline
    }
  });

  await safeRoleAdd(member, config.newArrivalRoleId);

  const welcomeChannel = config.welcomeChannelId
    ? await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null)
    : null;

  const message = WELCOME_MESSAGE;
  if (welcomeChannel) {
    await safeSend(welcomeChannel, { content: `${member}, ${message}` });
  }
  await safeSend(member, { content: message });

  await logAction(member.guild, "ONBOARDING_STARTED", {
    userId: member.id,
    reason: "New member joined Poly Saloon.",
    metadata: { introDeadline: deadline.toISOString() }
  });
}

function hasConfiguredRole(member, roleId) {
  return Boolean(roleId && member.roles.cache.has(roleId));
}

async function acceptRules(interaction) {
  const config = await getConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id);

  await prisma.onboardingUser.upsert({
    where: { guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id } },
    update: { rulesAccepted: true },
    create: {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      username: interaction.user.tag,
      joinedAt: member.joinedAt ?? new Date(),
      introDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      rulesAccepted: true
    }
  });

  const roleAdded = await safeRoleAdd(member, config.rulesAcceptedRoleId);
  if (config.rulesAcceptedRoleId && !roleAdded && !member.roles.cache.has(config.rulesAcceptedRoleId)) {
    await logAction(interaction.guild, "RULES_ACCEPTED_ROLE_FAILED", {
      userId: interaction.user.id,
      reason: "Could not assign Rules Accepted role. Check bot role hierarchy."
    });
  }
  await maybeCompleteOnboarding(member);

  await interaction.reply({
    content: "Rules accepted. Thank you for helping keep Poly Saloon warm, grown, and safe.",
    ephemeral: true
  });
}

async function handleIntroMessage(message) {
  if (message.author.bot || !message.guild) return;
  const config = await getConfig(message.guild.id);
  if (message.channelId !== config.introChannelId) return;
  if (!message.member) return;

  const existingRecord = await prisma.onboardingUser.findUnique({
    where: { guildId_userId: { guildId: message.guild.id, userId: message.author.id } }
  });
  const isSaloonMember = hasConfiguredRole(message.member, config.saloonMemberRoleId);
  const isNewArrival = hasConfiguredRole(message.member, config.newArrivalRoleId);
  const isPendingRecord = existingRecord && !existingRecord.removedAt && (!existingRecord.rulesAccepted || !existingRecord.introCompleted);

  if (isSaloonMember && !isNewArrival) return;
  if (!isPendingRecord && !isNewArrival) return;

  const validation = validateIntro(message.content);
  const updated = await prisma.onboardingUser.upsert({
    where: { guildId_userId: { guildId: message.guild.id, userId: message.author.id } },
    update: {
      introMessageId: message.id,
      introChannelId: message.channelId,
      introSubmittedAt: new Date(),
      introValidationStatus: validation.status,
      introCompleted: validation.ok
    },
    create: {
      guildId: message.guild.id,
      userId: message.author.id,
      username: message.author.tag,
      joinedAt: message.member?.joinedAt ?? new Date(),
      introDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      introMessageId: message.id,
      introChannelId: message.channelId,
      introSubmittedAt: new Date(),
      introValidationStatus: validation.status,
      introCompleted: validation.ok
    }
  });

  if (validation.status === "underage") {
    await message.reply("Poly Saloon is 18+ only, so we have to remove this account from the server. Wishing you safety and care elsewhere.");
    await removeForOnboarding(message.member, "Under 18 intro age submitted.");
    return;
  }

  if (!validation.ok) {
    const missingText = validation.missing.length ? `Missing fields: ${validation.missing.join(", ")}` : "The Age field needs a clear number.";
    await message.reply(`Almost there. Please edit or repost your intro with the full template filled out. ${missingText}`);
    return;
  }

  if (!updated.rulesAccepted) {
    await message.reply(`Your intro is complete. One last step: please accept the rules in ${channelMention(config.rulesChannelId, "#the-rules")}.`);
    return;
  }

  await maybeCompleteOnboarding(message.member);
  await message.reply("Your intro is complete and your rules are accepted. Welcome fully into Poly Saloon.");
}

async function maybeCompleteOnboarding(member) {
  const record = await prisma.onboardingUser.findUnique({
    where: { guildId_userId: { guildId: member.guild.id, userId: member.id } }
  });
  if (!record?.rulesAccepted || !record.introCompleted || record.removedAt) return false;

  const config = await getConfig(member.guild.id);
  const removedNewArrival = await safeRoleRemove(member, config.newArrivalRoleId);
  const addedSaloonMember = await safeRoleAdd(member, config.saloonMemberRoleId);
  const roleFailures = [
    config.newArrivalRoleId && !removedNewArrival && member.roles.cache.has(config.newArrivalRoleId) ? "remove New Arrival" : null,
    config.saloonMemberRoleId && !addedSaloonMember && !member.roles.cache.has(config.saloonMemberRoleId) ? "add Saloon Member" : null
  ].filter(Boolean);
  await logAction(member.guild, roleFailures.length ? "ONBOARDING_COMPLETED_ROLE_FAILURE" : "ONBOARDING_COMPLETED", {
    userId: member.id,
    reason: roleFailures.length ? "Rules and intro complete, but role updates failed." : "Rules accepted and intro completed.",
    metadata: roleFailures.length ? { roleFailures } : undefined
  });
  return !roleFailures.length;
}

async function removeForOnboarding(member, reason) {
  await safeSend(member, { content: `You were removed from Poly Saloon: ${reason}` });
  if (!member.kickable) {
    await logAction(member.guild, "ONBOARDING_REMOVAL_FAILED", {
      userId: member.id,
      reason: "Bot could not kick this member. Check bot permissions and role hierarchy.",
      metadata: { originalReason: reason }
    });
    return false;
  }
  try {
    await member.kick(reason);
  } catch (error) {
    await logAction(member.guild, "ONBOARDING_REMOVAL_FAILED", {
      userId: member.id,
      reason: "Discord rejected the kick request.",
      metadata: { originalReason: reason, error: error.message }
    });
    return false;
  }
  await prisma.onboardingUser.updateMany({
    where: { guildId: member.guild.id, userId: member.id },
    data: { removedAt: new Date(), removalReason: reason }
  });
  await logAction(member.guild, "ONBOARDING_REMOVAL", { userId: member.id, reason });
  return true;
}

async function enforceOnboarding(client) {
  const now = new Date();
  const pending = await prisma.onboardingUser.findMany({
    where: {
      removedAt: null,
      OR: [{ rulesAccepted: false }, { introCompleted: false }]
    }
  });

  for (const record of pending) {
    const guild = await client.guilds.fetch(record.guildId).catch(() => null);
    if (!guild) continue;
    const config = await getConfig(guild.id);
    const member = await guild.members.fetch(record.userId).catch(() => null);
    if (!member) continue;

    if (hasConfiguredRole(member, config.saloonMemberRoleId) && !hasConfiguredRole(member, config.newArrivalRoleId)) {
      await prisma.onboardingUser.update({
        where: { id: record.id },
        data: {
          rulesAccepted: true,
          introCompleted: true,
          introValidationStatus: "already_saloon_member"
        }
      });
      await logAction(guild, "ONBOARDING_RECORD_RECONCILED", {
        userId: member.id,
        reason: "Member already has Saloon Member role; skipped enforcement."
      });
      continue;
    }

    const ageMs = now.getTime() - record.joinedAt.getTime();
    const remainingMs = record.introDeadline.getTime() - now.getTime();
    const missing = [
      record.rulesAccepted ? null : "accept the rules",
      record.introCompleted ? null : "post a complete intro"
    ].filter(Boolean).join(" and ");

    if (ageMs >= 12 * 60 * 60 * 1000 && !record.reminder12hSent && remainingMs > 60 * 60 * 1000) {
      await safeSend(member, { content: `A warm reminder from the door: please ${missing} within 24 hours of joining Poly Saloon.` });
      await prisma.onboardingUser.update({ where: { id: record.id }, data: { reminder12hSent: true } });
    }

    if (remainingMs <= 60 * 60 * 1000 && remainingMs > 0 && !record.reminder23hSent) {
      await safeSend(member, { content: `Final onboarding reminder: please ${missing} within the next hour so you can stay in Poly Saloon.` });
      await prisma.onboardingUser.update({ where: { id: record.id }, data: { reminder23hSent: true } });
    }

    if (remainingMs <= 0) {
      await removeForOnboarding(member, `Onboarding incomplete after 24 hours: still needs to ${missing}.`).catch((error) =>
        logAction(guild, "ONBOARDING_REMOVAL_FAILED", {
          userId: member.id,
          reason: error.message,
          metadata: { missing }
        })
      );
    }
  }
}

async function buildStatus(guildId, userId) {
  const record = await prisma.onboardingUser.findUnique({
    where: { guildId_userId: { guildId, userId } }
  });
  if (!record) return "No onboarding record found for that member.";
  return [
    `Rules accepted: ${record.rulesAccepted ? "yes" : "no"}`,
    `Intro complete: ${record.introCompleted ? "yes" : "no"}`,
    `Intro status: ${record.introValidationStatus}`,
    `Deadline: ${record.introDeadline.toISOString()}`,
    record.removedAt ? `Removed: ${record.removedAt.toISOString()} (${record.removalReason})` : null
  ].filter(Boolean).join("\n");
}

module.exports = {
  validateIntro,
  handleMemberJoin,
  acceptRules,
  handleIntroMessage,
  maybeCompleteOnboarding,
  removeForOnboarding,
  enforceOnboarding,
  buildStatus
};
