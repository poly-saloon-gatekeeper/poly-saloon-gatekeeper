const prisma = require("../db");
const { getConfig } = require("./configService");
const { logAction } = require("./logService");
const { BOT_INTRO_DM, BOT_INTRO_ANNOUNCEMENT } = require("../constants");
const { safeSend } = require("../utils/discord");
const { isModerator } = require("../utils/permissions");

const campaigns = new Map();
const FINAL_BOT_INTRO_STATUSES = ["sent", "opted_out", "failed", "skipped"];

function asArray(collectionOrArray) {
  if (Array.isArray(collectionOrArray)) return collectionOrArray;
  if (collectionOrArray?.values) return Array.from(collectionOrArray.values());
  return [];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextDelayMs() {
  if (process.env.NODE_ENV === "test") return 1;
  return 5000 + Math.floor(Math.random() * 5001);
}

function hasRole(member, roleId) {
  return Boolean(roleId && member.roles?.cache?.has(roleId));
}

function isEligibleMember(member, config) {
  if (!member || member.user?.bot) return { eligible: false, reason: "bot" };
  if (hasRole(member, config.newArrivalRoleId)) return { eligible: false, reason: "new_arrival" };
  if (hasRole(member, config.quarantinedRoleId)) return { eligible: false, reason: "quarantined" };
  if (config.saloonMemberRoleId && !hasRole(member, config.saloonMemberRoleId)) {
    return { eligible: false, reason: "missing_saloon_member_role" };
  }
  if (!config.includeModeratorsInBotIntroDM && isModerator(member)) {
    return { eligible: false, reason: "moderator_excluded" };
  }
  return { eligible: true };
}

async function getEligibleMembers(guild) {
  const config = await getConfig(guild.id);
  const members = asArray(await guild.members.fetch());
  const eligible = [];
  const skipped = [];

  for (const member of members) {
    const result = isEligibleMember(member, config);
    if (result.eligible) eligible.push(member);
    else skipped.push({ member, reason: result.reason });
  }

  return { eligible, skipped, config };
}

async function shouldSend(guildId, userId) {
  const existing = await prisma.botIntroDMLog.findUnique({
    where: { guildId_userId: { guildId, userId } }
  });
  if (!existing) return true;
  return !FINAL_BOT_INTRO_STATUSES.includes(existing.status);
}

async function upsertStatus(guildId, userId, status, failureReason = null) {
  return prisma.botIntroDMLog.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: {
      status,
      failureReason,
      sentAt: status === "sent" ? new Date() : undefined
    },
    create: {
      guildId,
      userId,
      status,
      failureReason,
      sentAt: status === "sent" ? new Date() : null
    }
  });
}

async function sendBotIntroToMember(member, { ignoreEligibility = false, moderatorId = null } = {}) {
  const guildId = member.guild.id;
  const userId = member.id;
  const config = await getConfig(guildId);
  const eligibility = isEligibleMember(member, config);

  if (!ignoreEligibility && !eligibility.eligible) {
    await upsertStatus(guildId, userId, "skipped", eligibility.reason);
    await logAction(member.guild, "BOT_INTRO_DM_SKIPPED", { userId, moderatorId, reason: eligibility.reason });
    return { status: "skipped", reason: eligibility.reason };
  }

  const existing = await prisma.botIntroDMLog.findUnique({
    where: { guildId_userId: { guildId, userId } }
  });
  if (existing?.status === "opted_out") {
    return { status: "opted_out", reason: "member_opted_out" };
  }
  if (FINAL_BOT_INTRO_STATUSES.includes(existing?.status)) {
    return { status: existing.status, reason: "already_final" };
  }

  try {
    await member.send({ content: BOT_INTRO_DM });
    await upsertStatus(guildId, userId, "sent");
    await logAction(member.guild, "BOT_INTRO_DM_SENT", { userId, moderatorId });
    return { status: "sent" };
  } catch (error) {
    const reason = error?.message?.slice(0, 500) || "DM failed / closed.";
    await upsertStatus(guildId, userId, "failed", reason);
    await logAction(member.guild, "BOT_INTRO_DM_FAILED", {
      userId,
      moderatorId,
      reason: "DM failed / closed.",
      metadata: { error: reason }
    });
    return { status: "failed", reason };
  }
}

async function prepareCampaign(guild) {
  const { eligible } = await getEligibleMembers(guild);
  const queued = [];

  for (const member of eligible) {
    if (await shouldSend(guild.id, member.id)) {
      await upsertStatus(guild.id, member.id, "pending");
      queued.push(member);
    }
  }

  return queued;
}

async function startCampaign(guild, moderatorId) {
  if (campaigns.get(guild.id)?.running) {
    return { started: false, queued: campaigns.get(guild.id).queue.length, reason: "already_running" };
  }

  const queue = await prepareCampaign(guild);
  const state = { running: true, stopRequested: false, queue };
  campaigns.set(guild.id, state);
  await prisma.botIntroDMCampaign.upsert({
    where: { guildId: guild.id },
    update: {
      status: "running",
      startedBy: moderatorId,
      startedAt: new Date(),
      stoppedAt: null,
      finishedAt: null
    },
    create: {
      guildId: guild.id,
      status: "running",
      startedBy: moderatorId,
      startedAt: new Date()
    }
  });
  await logAction(guild, "BOT_INTRO_DM_CAMPAIGN_STARTED", {
    moderatorId,
    metadata: { queued: queue.length }
  });

  state.promise = processQueue(guild, state, moderatorId).catch(async (error) => {
    await logAction(guild, "BOT_INTRO_DM_CAMPAIGN_ERROR", {
      moderatorId,
      reason: error.message
    });
  });

  return { started: true, queued: queue.length };
}

async function processQueue(guild, state, moderatorId) {
  while (state.running && !state.stopRequested && state.queue.length) {
    const member = state.queue.shift();
    await sendBotIntroToMember(member, { moderatorId });
    await delay(nextDelayMs());
  }

  state.running = false;
  const action = state.stopRequested ? "BOT_INTRO_DM_CAMPAIGN_STOPPED" : "BOT_INTRO_DM_CAMPAIGN_FINISHED";
  await prisma.botIntroDMCampaign.upsert({
    where: { guildId: guild.id },
    update: state.stopRequested
      ? { status: "stopped", stoppedAt: new Date() }
      : { status: "finished", finishedAt: new Date() },
    create: {
      guildId: guild.id,
      status: state.stopRequested ? "stopped" : "finished",
      stoppedAt: state.stopRequested ? new Date() : null,
      finishedAt: state.stopRequested ? null : new Date()
    }
  });
  await logAction(guild, action, { moderatorId, metadata: { remaining: state.queue.length } });
}

async function stopCampaign(guildId) {
  const state = campaigns.get(guildId);
  await prisma.botIntroDMCampaign.upsert({
    where: { guildId },
    update: { status: "stopped", stoppedAt: new Date() },
    create: { guildId, status: "stopped", stoppedAt: new Date() }
  });
  if (!state?.running) return false;
  state.stopRequested = true;
  return true;
}

async function resumeRunningCampaigns(client) {
  const runningCampaigns = await prisma.botIntroDMCampaign.findMany({
    where: { status: "running" }
  });

  for (const campaign of runningCampaigns) {
    if (campaigns.get(campaign.guildId)?.running) continue;
    const guild = await client.guilds.fetch(campaign.guildId).catch(() => null);
    if (!guild) continue;

    const members = asArray(await guild.members.fetch());
    const config = await getConfig(guild.id);
    const pendingLogs = await prisma.botIntroDMLog.findMany({
      where: { guildId: guild.id, status: "pending" },
      select: { userId: true }
    });
    const pendingIds = new Set(pendingLogs.map((log) => log.userId));
    const queue = members.filter((member) => pendingIds.has(member.id) && isEligibleMember(member, config).eligible);
    const state = { running: true, stopRequested: false, queue };
    campaigns.set(guild.id, state);

    await logAction(guild, "BOT_INTRO_DM_CAMPAIGN_RESUMED", {
      moderatorId: campaign.startedBy,
      metadata: { queued: queue.length }
    });

    state.promise = processQueue(guild, state, campaign.startedBy).catch(async (error) => {
      await logAction(guild, "BOT_INTRO_DM_CAMPAIGN_ERROR", {
        moderatorId: campaign.startedBy,
        reason: error.message
      });
    });
    if (process.env.NODE_ENV === "test") {
      await state.promise;
    }
  }
}

async function getStatus(guild) {
  const { eligible } = await getEligibleMembers(guild);
  const eligibleIds = eligible.map((member) => member.id);
  const counts = await prisma.botIntroDMLog.groupBy({
    by: ["status"],
    where: { guildId: guild.id },
    _count: { status: true }
  });
  const byStatus = Object.fromEntries(counts.map((item) => [item.status, item._count.status]));
  const sent = byStatus.sent ?? 0;
  const failed = byStatus.failed ?? 0;
  const skipped = byStatus.skipped ?? 0;
  const optedOut = byStatus.opted_out ?? 0;
  const finalLogs = await prisma.botIntroDMLog.findMany({
    where: {
      guildId: guild.id,
      userId: { in: eligibleIds },
      status: { in: FINAL_BOT_INTRO_STATUSES }
    },
    select: { userId: true }
  });
  const finalUserIds = new Set(finalLogs.map((log) => log.userId));

  return {
    totalEligible: eligible.length,
    sent,
    failed,
    skipped,
    optedOut,
    remaining: eligible.filter((member) => !finalUserIds.has(member.id)).length,
    running: Boolean(campaigns.get(guild.id)?.running)
  };
}

async function optOut(guildId, userId) {
  await upsertStatus(guildId, userId, "opted_out");
}

async function resetUser(guildId, userId) {
  await prisma.botIntroDMLog.deleteMany({ where: { guildId, userId } });
}

async function postAnnouncement(channel) {
  return safeSend(channel, { content: BOT_INTRO_ANNOUNCEMENT });
}

module.exports = {
  BOT_INTRO_DM,
  BOT_INTRO_ANNOUNCEMENT,
  isEligibleMember,
  sendBotIntroToMember,
  prepareCampaign,
  startCampaign,
  stopCampaign,
  resumeRunningCampaigns,
  getStatus,
  optOut,
  resetUser,
  postAnnouncement
};
