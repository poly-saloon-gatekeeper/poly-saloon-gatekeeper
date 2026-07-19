const { EmbedBuilder } = require("discord.js");
const prisma = require("../db");
const { getConfig } = require("./configService");

async function logAction(guild, action, { userId, moderatorId, reason, metadata } = {}) {
  const cleanReason = typeof reason === "string" ? reason.trim() : reason;
  await prisma.modLog.create({
    data: {
      guildId: guild.id,
      action,
      userId,
      moderatorId,
      reason: cleanReason,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  });

  const config = await getConfig(guild.id);
  const channelId = action === "REPORT_CREATED" && config.reportsChannelId
    ? config.reportsChannelId
    : config.modLogChannelId;
  const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
  if (!channel) return;

  const fields = [];
  if (userId) {
    fields.push({
      name: action === "REPORT_CREATED" ? "Reported member" : "Member",
      value: `<@${userId}>`,
      inline: true
    });
  }
  if (moderatorId) {
    fields.push({
      name: action === "REPORT_CREATED" ? "Reported by" : "Moderator",
      value: `<@${moderatorId}>`,
      inline: true
    });
  }
  if (cleanReason) {
    fields.push({
      name: action === "REPORT_CREATED" ? "Report reason" : "Reason",
      value: String(cleanReason).slice(0, 1024)
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x9b5de5)
    .setTitle(`Poly Saloon Log: ${action}`)
    .setTimestamp();

  if (fields.length) embed.addFields(fields);

  if (metadata) {
    embed.addFields({ name: "Details", value: `\`\`\`json\n${JSON.stringify(metadata, null, 2).slice(0, 900)}\n\`\`\`` });
  }

  await channel.send({ embeds: [embed] }).catch(() => null);
}

module.exports = { logAction };
