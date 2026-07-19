const ms = require("ms");
const prisma = require("../db");
const { getConfig } = require("./configService");
const { logAction } = require("./logService");
const { safeRoleAdd, safeSend } = require("../utils/discord");
const { actorCanManageTarget, botCanManageTarget } = require("../utils/permissions");
const { shouldMonitorMessage } = require("./channelMonitorService");

const recentMessages = new Map();

async function warnMember(guild, moderatorId, target, reason) {
  await prisma.warning.create({
    data: { guildId: guild.id, userId: target.id, moderatorId, reason }
  });
  await logAction(guild, "WARNING", { userId: target.id, moderatorId, reason });
  await safeSend(target, { content: `Poly Saloon warning: ${reason}` });
}

async function createReport(guild, reporterId, targetId, reason) {
  await prisma.report.create({
    data: { guildId: guild.id, reporterId, targetId, reason }
  });
  await logAction(guild, "REPORT_CREATED", {
    userId: targetId,
    moderatorId: reporterId,
    reason
  });
}

async function removeMember(member, moderatorId, reason) {
  const removalReason = String(reason ?? "").trim();
  if (!removalReason) {
    await logAction(member.guild, "MEMBER_REMOVE_FAILED", {
      userId: member.id,
      moderatorId,
      reason: "Removal reason was missing or blank."
    });
    throw new Error("A removal reason is required.");
  }
  const moderator = await member.guild.members.fetch(moderatorId);
  if (!actorCanManageTarget(moderator, member)) {
    await logAction(member.guild, "MEMBER_REMOVE_FAILED", {
      userId: member.id,
      moderatorId,
      reason: "Moderator role is not above target member role."
    });
    throw new Error("You cannot remove a member with an equal or higher role.");
  }
  if (!botCanManageTarget(member.guild, member) || !member.kickable) {
    await logAction(member.guild, "MEMBER_REMOVE_FAILED", {
      userId: member.id,
      moderatorId,
      reason: "Bot cannot kick target. Check Kick Members permission and role hierarchy."
    });
    throw new Error("I cannot remove that member. Move my bot role above their highest role and confirm I have Kick Members.");
  }
  await safeSend(member, { content: `You were removed from Poly Saloon: ${removalReason}` });
  await member.kick(removalReason);
  await logAction(member.guild, "MEMBER_REMOVED", { userId: member.id, moderatorId, reason: removalReason });
}

async function timeoutMember(member, moderatorId, durationText, reason) {
  const durationMs = ms(durationText);
  if (!durationMs || durationMs < 1000) {
    await logAction(member.guild, "TIMEOUT_FAILED", {
      userId: member.id,
      moderatorId,
      reason: "Invalid timeout duration.",
      metadata: { duration: durationText }
    });
    throw new Error("Use a duration like 10m, 2h, or 1d.");
  }
  const moderator = await member.guild.members.fetch(moderatorId);
  if (!actorCanManageTarget(moderator, member)) {
    await logAction(member.guild, "TIMEOUT_FAILED", {
      userId: member.id,
      moderatorId,
      reason: "Moderator role is not above target member role.",
      metadata: { duration: durationText }
    });
    throw new Error("You cannot timeout a member with an equal or higher role.");
  }
  if (!botCanManageTarget(member.guild, member) || !member.moderatable) {
    await logAction(member.guild, "TIMEOUT_FAILED", {
      userId: member.id,
      moderatorId,
      reason: "Bot cannot timeout target. Check Moderate Members permission and role hierarchy.",
      metadata: { duration: durationText }
    });
    throw new Error("I cannot timeout that member. Move my bot role above their highest role and confirm I have Moderate Members.");
  }
  await member.timeout(durationMs, reason);
  await logAction(member.guild, "TIMEOUT", {
    userId: member.id,
    moderatorId,
    reason,
    metadata: { duration: durationText }
  });
}

async function strikeUser(guild, userId, reason, message, severity = 1) {
  await prisma.warning.create({
    data: { guildId: guild.id, userId, moderatorId: guild.client.user.id, reason }
  });
  await logAction(guild, "AUTO_STRIKE", { userId, reason, metadata: { severity } });

  const count = await prisma.warning.count({ where: { guildId: guild.id, userId } });
  const config = await getConfig(guild.id);
  const member = await guild.members.fetch(userId).catch(() => null);

  if (config.quarantineEnabled && config.quarantinedRoleId && count >= 3 && member && botCanManageTarget(guild, member)) {
    const added = await safeRoleAdd(member, config.quarantinedRoleId);
    await logAction(guild, added ? "QUARANTINED" : "QUARANTINE_FAILED", {
      userId,
      reason: added ? "Three or more strikes." : "Could not assign Quarantined role. Check role hierarchy."
    });
  }

  if (message?.deletable) {
    await message.delete().catch(() => null);
  }
}

function containsBlockedLink(content, config) {
  const lower = content.toLowerCase();
  const invitePatterns = config.inviteBlocklist
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const suspiciousPatterns = config.suspiciousLinkBlocklist
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const hasInvite = invitePatterns.some((pattern) => lower.includes(pattern));
  const hasSuspicious = suspiciousPatterns.some((pattern) => lower.includes(pattern));
  return hasInvite || hasSuspicious;
}

async function checkSpam(message) {
  if (!message.guild || message.author.bot) return;
  const config = await getConfig(message.guild.id);
  if (!config.antiSpamEnabled) return;
  if (!shouldMonitorMessage(message, config)) return;

  const content = message.content ?? "";
  if (!content) return;

  if (containsBlockedLink(content, config)) {
    await strikeUser(message.guild, message.author.id, "Blocked invite or suspicious link.", message, 2);
    return;
  }

  if ((content.match(/<@!?&?\d+>/g) ?? []).length >= 6 || message.mentions.everyone) {
    await strikeUser(message.guild, message.author.id, "Mass mention spam.", message, 2);
    return;
  }

  const now = Date.now();
  const key = `${message.guild.id}:${message.author.id}`;
  const bucket = (recentMessages.get(key) ?? []).filter((entry) => now - entry.at < 15000);
  bucket.push({ at: now, content });
  recentMessages.set(key, bucket);

  const repeated = bucket.filter((entry) => entry.content === content).length;
  if (bucket.length >= 7 || repeated >= 4) {
    await strikeUser(message.guild, message.author.id, "Repeated message spam.", message, 1);
  }
}

module.exports = {
  warnMember,
  createReport,
  removeMember,
  timeoutMember,
  checkSpam
};
