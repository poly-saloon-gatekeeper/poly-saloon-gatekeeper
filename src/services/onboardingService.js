const prisma = require("../db");
const { getConfig } = require("./configService");
const { logAction } = require("./logService");
const { INTRO_LABELS, buildWelcomeMessage } = require("../constants");
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

  const message = buildWelcomeMessage({
    rulesChannel: channelMention(config.rulesChannelId, "#the-rules"),
    introChannel: channelMention(config.introChannelId, "#general-chat-introductions")
  });
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

function roleIdsAreDistinct(...roleIds) {
  const configured = roleIds.filter(Boolean);
  return new Set(configured).size === configured.length;
}

async function findCompleteIntroInChannel(guild, config, userId) {
  const scan = await scanCompleteIntroInChannel(guild, config, userId);
  return scan.intro ?? null;
}

async function scanCompleteIntroInChannel(guild, config, userId) {
  if (!config.introChannelId) return { status: "unavailable", intro: null };
  const channel = await guild.channels.fetch(config.introChannelId).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) return { status: "unavailable", intro: null };

  let before;
  while (true) {
    const messages = await channel.messages.fetch({ limit: 100, before }).catch(() => undefined);
    if (!messages) return { status: "unavailable", intro: null };
    if (!messages.size) return { status: "not_found", intro: null };

    const intro = messages
      .filter((message) => message.author?.id === userId)
      .find((message) => validateIntro(message.content ?? "").ok);

    if (intro) return { status: "found", intro };
    before = messages.last()?.id;
    if (!before || messages.size < 100) return { status: "not_found", intro: null };
  }
}

function effectiveIntroDeadline(record, member) {
  const joinedDeadline = member.joinedAt
    ? new Date(member.joinedAt.getTime() + 24 * 60 * 60 * 1000)
    : null;
  if (!joinedDeadline || joinedDeadline <= record.introDeadline) return record.introDeadline;
  return joinedDeadline;
}

async function reconcileOnboardingRecord(guild, member, record, config) {
  const update = {};

  if (!record.rulesAccepted && hasConfiguredRole(member, config.rulesAcceptedRoleId)) {
    update.rulesAccepted = true;
  }

  if (!record.introCompleted) {
    const intro = await findCompleteIntroInChannel(guild, config, member.id);
    if (intro) {
      update.introCompleted = true;
      update.introValidationStatus = "existing_intro_found";
      update.introMessageId = intro.id;
      update.introChannelId = intro.channelId;
      update.introSubmittedAt = intro.createdAt ?? new Date();
    }
  }

  const saloonRoleMeansApproved = roleIdsAreDistinct(config.newArrivalRoleId, config.saloonMemberRoleId)
    && hasConfiguredRole(member, config.saloonMemberRoleId)
    && !hasConfiguredRole(member, config.newArrivalRoleId);

  if (saloonRoleMeansApproved) {
    update.rulesAccepted = true;
    update.introCompleted = true;
    update.introValidationStatus = "already_saloon_member";
  }

  if (!Object.keys(update).length) return record;

  const updated = await prisma.onboardingUser.update({
    where: { id: record.id },
    data: update
  });

  await logAction(guild, "ONBOARDING_RECORD_RECONCILED", {
    userId: member.id,
    reason: "Onboarding status was reconciled from roles or intro-channel history.",
    metadata: update
  });

  return updated;
}

async function acceptRules(interaction) {
  const config = await getConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const existingRecord = await prisma.onboardingUser.findUnique({
    where: { guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id } }
  });

  if (existingRecord?.rulesAccepted || hasConfiguredRole(member, config.rulesAcceptedRoleId)) {
    await maybeCompleteOnboarding(member);
    await interaction.deferUpdate();
    return;
  }

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
  const completed = await maybeCompleteOnboarding(member);

  await interaction.reply({
    content: completed
      ? "Rules accepted and your intro is complete. Welcome fully into Poly Saloon."
      : `Rules accepted. Next, post your introduction in ${channelMention(config.introChannelId, "#general-chat-introductions")} to unlock full server access.`,
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
    await safeSend(message.member, {
      content: `Your intro is complete. One last step: please accept the rules in ${channelMention(config.rulesChannelId, "#the-rules")}.`
    });
    return;
  }

  await maybeCompleteOnboarding(message.member);
  await safeSend(message.member, {
    content: "Your intro is complete and your rules are accepted. Welcome fully into Poly Saloon."
  });
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

    const reconciledRecord = await reconcileOnboardingRecord(guild, member, record, config);
    if (reconciledRecord.rulesAccepted && reconciledRecord.introCompleted) {
      await maybeCompleteOnboarding(member);
      continue;
    }

    const ambiguousOnboardingRoles = !roleIdsAreDistinct(
      config.newArrivalRoleId,
      config.rulesAcceptedRoleId,
      config.saloonMemberRoleId
    );

    const deadline = effectiveIntroDeadline(reconciledRecord, member);
    if (deadline > reconciledRecord.introDeadline) {
      await prisma.onboardingUser.update({ where: { id: reconciledRecord.id }, data: { introDeadline: deadline } });
    }

    const ageMs = now.getTime() - record.joinedAt.getTime();
    const remainingMs = deadline.getTime() - now.getTime();
    const missing = [
      reconciledRecord.rulesAccepted ? null : "accept the rules",
      reconciledRecord.introCompleted ? null : "post a complete intro"
    ].filter(Boolean).join(" and ");

    if (ageMs >= 12 * 60 * 60 * 1000 && !reconciledRecord.reminder12hSent && remainingMs > 60 * 60 * 1000) {
      await safeSend(member, { content: `A warm reminder from the door: please ${missing} within 24 hours of joining Poly Saloon.` });
      await prisma.onboardingUser.update({ where: { id: reconciledRecord.id }, data: { reminder12hSent: true } });
    }

    if (remainingMs <= 60 * 60 * 1000 && remainingMs > 0 && !reconciledRecord.reminder23hSent) {
      await safeSend(member, { content: `Final onboarding reminder: please ${missing} within the next hour so you can stay in Poly Saloon.` });
      await prisma.onboardingUser.update({ where: { id: reconciledRecord.id }, data: { reminder23hSent: true } });
    }

    if (remainingMs <= 0) {
      const finalIntroScan = await scanCompleteIntroInChannel(guild, config, member.id);
      if (finalIntroScan.status === "found") {
        const finalRecord = await prisma.onboardingUser.update({
          where: { id: reconciledRecord.id },
          data: {
            introCompleted: true,
            introValidationStatus: "existing_intro_found",
            introMessageId: finalIntroScan.intro.id,
            introChannelId: finalIntroScan.intro.channelId,
            introSubmittedAt: finalIntroScan.intro.createdAt ?? new Date()
          }
        });
        if (finalRecord.rulesAccepted) await maybeCompleteOnboarding(member);
        continue;
      }
      if (finalIntroScan.status === "unavailable") {
        await logAction(guild, "ONBOARDING_REMOVAL_SKIPPED", {
          userId: member.id,
          reason: "Skipped automatic removal because the intro channel could not be fully scanned.",
          metadata: { missing }
        });
        continue;
      }
      if (ambiguousOnboardingRoles) {
        await logAction(guild, "ONBOARDING_REMOVAL_SKIPPED", {
          userId: member.id,
          reason: "Skipped automatic removal because onboarding roles are not distinct.",
          metadata: { missing }
        });
        continue;
      }
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

async function buildStatus(guildOrGuildId, userId) {
  const guildId = typeof guildOrGuildId === "string" ? guildOrGuildId : guildOrGuildId.id;
  let record = await prisma.onboardingUser.findUnique({
    where: { guildId_userId: { guildId, userId } }
  });

  if (typeof guildOrGuildId !== "string") {
    const guild = guildOrGuildId;
    const config = await getConfig(guild.id);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (record && member) {
      record = await reconcileOnboardingRecord(guild, member, record, config);
    } else if (!record) {
      const introScan = await scanCompleteIntroInChannel(guild, config, userId);
      if (introScan.status === "found") {
        const user = await guild.client.users.fetch(userId).catch(() => null);
        record = await prisma.onboardingUser.create({
          data: {
            guildId: guild.id,
            userId,
            username: user?.tag ?? userId,
            joinedAt: member?.joinedAt ?? introScan.intro.createdAt ?? new Date(),
            introDeadline: member?.joinedAt
              ? new Date(member.joinedAt.getTime() + 24 * 60 * 60 * 1000)
              : new Date(),
            rulesAccepted: member ? hasConfiguredRole(member, config.rulesAcceptedRoleId) : false,
            introCompleted: true,
            introMessageId: introScan.intro.id,
            introChannelId: introScan.intro.channelId,
            introSubmittedAt: introScan.intro.createdAt ?? new Date(),
            introValidationStatus: "existing_intro_found"
          }
        });
        await logAction(guild, "ONBOARDING_RECORD_RECONCILED", {
          userId,
          reason: "Intro-check found an existing complete intro in channel history."
        });
      }
    }
  }

  if (!record) return "No onboarding record found for that member, and no complete intro was found in the configured intro channel.";
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
  findCompleteIntroInChannel,
  reconcileOnboardingRecord,
  buildStatus
};
