const prisma = require("../db");
const env = require("../config");

async function getConfig(guildId) {
  return prisma.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: {
      guildId,
      dailyPromptTime: env.DAILY_PROMPT_TIME,
      timezone: env.TIMEZONE
    }
  });
}

async function updateConfig(guildId, data) {
  await getConfig(guildId);
  return prisma.guildConfig.update({
    where: { guildId },
    data
  });
}

module.exports = { getConfig, updateConfig };
