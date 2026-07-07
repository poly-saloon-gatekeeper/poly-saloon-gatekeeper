const { EmbedBuilder } = require("discord.js");
const prisma = require("../db");
const { getConfig } = require("./configService");
const { DEFAULT_PROMPTS, WEEKLY_THEMES } = require("../constants");
const { logAction } = require("./logService");

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localDateKey(date, timezone) {
  const parts = localParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localTimeHHMM(date, timezone) {
  const parts = localParts(date, timezone);
  return `${parts.hour}:${parts.minute}`;
}

function localDayIndex(date, timezone) {
  const weekday = localParts(date, timezone).weekday;
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday];
}

function isValidPromptTime(time) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

async function seedDefaultPrompts(guildId) {
  for (const [theme, prompts] of Object.entries(DEFAULT_PROMPTS)) {
    for (const text of prompts) {
      const existing = await prisma.prompt.findFirst({ where: { guildId, theme, text } });
      if (!existing) {
        await prisma.prompt.create({ data: { guildId, theme, text, createdBy: "seed" } });
      }
    }
  }
}

async function getTodayPrompt(guildId, date = new Date(), timezone = "America/New_York") {
  await seedDefaultPrompts(guildId);
  const theme = WEEKLY_THEMES[localDayIndex(date, timezone)];
  const prompts = await prisma.prompt.findMany({ where: { guildId, theme, active: true } });
  if (!prompts.length) return { theme, text: "What kind of connection are you practicing with more intention this week?" };
  const index = Math.floor(date.getTime() / 86400000) % prompts.length;
  return prompts[index];
}

async function postTodayPrompt(guild, { date = new Date(), force = false, moderatorId = null } = {}) {
  const config = await getConfig(guild.id);
  const channelId = config.dailyPromptChannelId;
  const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
  if (!channel) {
    await logAction(guild, "DAILY_PROMPT_FAILED", {
      moderatorId,
      reason: "Daily prompt channel is not configured or could not be fetched."
    });
    return { posted: false, reason: "missing_channel" };
  }

  const postDate = localDateKey(date, config.timezone);
  const existing = await prisma.dailyPromptPost.findUnique({
    where: { guildId_postDate: { guildId: guild.id, postDate } }
  });
  if (existing && !force) {
    await logAction(guild, "DAILY_PROMPT_SKIPPED", {
      moderatorId,
      reason: "Daily prompt already posted for this local date.",
      metadata: { postDate }
    });
    return { posted: false, reason: "already_posted", postDate };
  }

  const prompt = await getTodayPrompt(guild.id, date, config.timezone);
  const embed = new EmbedBuilder()
    .setColor(0x00a896)
    .setTitle(prompt.theme)
    .setDescription(prompt.text)
    .setFooter({ text: "Poly Saloon daily prompt" })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  await prisma.dailyPromptPost.upsert({
    where: { guildId_postDate: { guildId: guild.id, postDate } },
    update: {
      promptId: prompt.id ?? null,
      channelId
    },
    create: {
      guildId: guild.id,
      postDate,
      promptId: prompt.id ?? null,
      channelId
    }
  });
  await logAction(guild, "DAILY_PROMPT_POSTED", {
    moderatorId,
    reason: prompt.text,
    metadata: { theme: prompt.theme, postDate, channelId }
  });
  return { posted: true, prompt, postDate };
}

async function addPrompt(guildId, theme, text, createdBy) {
  return prisma.prompt.create({ data: { guildId, theme, text, createdBy } });
}

async function runDailyPromptScheduler(client, date = new Date()) {
  const configs = await prisma.guildConfig.findMany({ where: { dailyPromptEnabled: true } });

  for (const config of configs) {
    const hhmm = localTimeHHMM(date, config.timezone);
    if (hhmm !== config.dailyPromptTime) continue;

    const guild = await client.guilds.fetch(config.guildId).catch(() => null);
    if (guild) await postTodayPrompt(guild, { date }).catch((error) =>
      logAction(guild, "DAILY_PROMPT_FAILED", {
        reason: error.message,
        metadata: { scheduledTime: config.dailyPromptTime }
      })
    );
  }
}

module.exports = {
  seedDefaultPrompts,
  getTodayPrompt,
  postTodayPrompt,
  addPrompt,
  runDailyPromptScheduler,
  localDateKey,
  localTimeHHMM,
  isValidPromptTime
};
