const { handleIntroMessage } = require("../services/onboardingService");
const { checkSpam } = require("../services/moderationService");
const logger = require("../logger");

async function messageCreate(message) {
  try {
    await handleIntroMessage(message);
    await checkSpam(message);
  } catch (error) {
    logger.error({ error, guildId: message.guild?.id, messageId: message.id }, "Message handler failed");
  }
}

module.exports = messageCreate;
