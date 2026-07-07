const { handleMemberJoin } = require("../services/onboardingService");
const logger = require("../logger");

async function guildMemberAdd(member) {
  try {
    await handleMemberJoin(member);
  } catch (error) {
    logger.error({ error, guildId: member.guild.id, userId: member.id }, "Failed to handle member join");
  }
}

module.exports = guildMemberAdd;
