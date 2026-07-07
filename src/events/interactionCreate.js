const { CUSTOM_IDS } = require("../constants");
const { acceptRules } = require("../services/onboardingService");
const { handleCommand, handleBotIntroStartConfirmation } = require("../commands/handler");
const logger = require("../logger");

async function interactionCreate(interaction) {
  try {
    if (interaction.isButton() && interaction.customId === CUSTOM_IDS.ACCEPT_RULES) {
      return acceptRules(interaction);
    }

    if (interaction.isButton() && interaction.customId === CUSTOM_IDS.CONFIRM_BOT_INTRO_START) {
      return handleBotIntroStartConfirmation(interaction);
    }

    if (interaction.isChatInputCommand()) {
      return handleCommand(interaction);
    }
  } catch (error) {
    logger.error({ error }, "Interaction failed");
    const message = error instanceof Error && error.message
      ? error.message
      : "Something went sideways. The team can check the bot logs.";
    const payload = { content: message, ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }
}

module.exports = interactionCreate;
