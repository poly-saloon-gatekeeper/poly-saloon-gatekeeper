const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { CUSTOM_IDS, RULES } = require("../constants");

function buildRulesMessage() {
  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle("Poly Saloon Rules")
    .setDescription("Read these with care. Poly Saloon is grown, respectful, consent-centered, and protective of its people.")
    .addFields({ name: "House Rules", value: RULES.map((rule, index) => `${index + 1}. ${rule}`).join("\n") });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.ACCEPT_RULES)
      .setStyle(ButtonStyle.Success)
      .setLabel("I Agree to the Rules")
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildRulesMessage };
