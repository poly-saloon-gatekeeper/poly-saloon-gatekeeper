const { EmbedBuilder } = require("discord.js");
const prisma = require("../db");
const { getConfig } = require("./configService");

async function logAction(guild, action, { userId, moderatorId, reason, metadata } = {}) {
  await prisma.modLog.create({
    data: {
      guildId: guild.id,
      action,
      userId,
      moderatorId,
      reason,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  });

  const config = await getConfig(guild.id);
  const channelId = action === "REPORT_CREATED" && config.reportsChannelId
    ? config.reportsChannelId
    : config.modLogChannelId;
  const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x9b5de5)
    .setTitle(`Poly Saloon Log: ${action}`)
    .addFields(
      userId ? [{ name: "Member", value: `<@${userId}>`, inline: true }] : [],
      moderatorId ? [{ name: "Moderator", value: `<@${moderatorId}>`, inline: true }] : [],
      reason ? [{ name: "Reason", value: reason.slice(0, 1024) }] : []
    )
    .setTimestamp();

  if (metadata) {
    embed.addFields({ name: "Details", value: `\`\`\`json\n${JSON.stringify(metadata, null, 2).slice(0, 900)}\n\`\`\`` });
  }

  await channel.send({ embeds: [embed] }).catch(() => null);
}

module.exports = { logAction };
