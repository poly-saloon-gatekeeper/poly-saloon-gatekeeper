const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getConfig, updateConfig } = require("./configService");

const MONITORABLE_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement
]);

function parseIdList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeIdList(ids) {
  return [...new Set(ids.filter(Boolean))].join(",");
}

function defaultExcludedChannelIds(config) {
  return [config.modLogChannelId, config.reportsChannelId].filter(Boolean);
}

function isMonitorableChannel(channel, botMember) {
  if (!channel || !MONITORABLE_CHANNEL_TYPES.has(channel.type)) return false;
  const permissions = channel.permissionsFor?.(botMember);
  if (!permissions) return false;
  return permissions.has(PermissionFlagsBits.ViewChannel) &&
    permissions.has(PermissionFlagsBits.ReadMessageHistory);
}

async function scanCurrentMonitorableChannels(guild, { includeLogChannels = false } = {}) {
  const config = await getConfig(guild.id);
  const botMember = guild.members.me ?? await guild.members.fetchMe?.().catch(() => null);
  const channels = await guild.channels.fetch();
  const excluded = new Set(includeLogChannels ? [] : defaultExcludedChannelIds(config));
  const monitorable = [];

  for (const channel of channels.values()) {
    if (!channel || excluded.has(channel.id)) continue;
    if (isMonitorableChannel(channel, botMember)) {
      monitorable.push({
        id: channel.id,
        name: channel.name,
        type: channel.type
      });
    }
  }

  return monitorable.sort((a, b) => a.name.localeCompare(b.name));
}

async function saveCurrentChannelScan(guild, options = {}) {
  const channels = await scanCurrentMonitorableChannels(guild, options);
  const config = await getConfig(guild.id);
  const excluded = options.includeLogChannels ? [] : defaultExcludedChannelIds(config);

  await updateConfig(guild.id, {
    monitorAllChannels: false,
    monitoredChannelIds: serializeIdList(channels.map((channel) => channel.id)),
    monitorExcludedChannelIds: serializeIdList(excluded)
  });

  return channels;
}

async function setMonitorAllChannels(guildId, enabled) {
  return updateConfig(guildId, { monitorAllChannels: enabled });
}

function shouldMonitorMessage(message, config) {
  if (!message.guild || message.author?.bot) return false;
  if (message.channelId === config.introChannelId) return true;

  const excludedIds = new Set([
    ...defaultExcludedChannelIds(config),
    ...parseIdList(config.monitorExcludedChannelIds)
  ]);
  if (excludedIds.has(message.channelId)) return false;

  if (config.monitorAllChannels) return true;
  return parseIdList(config.monitoredChannelIds).includes(message.channelId);
}

async function getMonitoringStatus(guild) {
  const config = await getConfig(guild.id);
  const scannedIds = new Set(parseIdList(config.monitoredChannelIds));
  const excludedIds = new Set([
    ...defaultExcludedChannelIds(config),
    ...parseIdList(config.monitorExcludedChannelIds)
  ]);
  const current = await scanCurrentMonitorableChannels(guild, { includeLogChannels: true });

  return {
    monitorAllChannels: config.monitorAllChannels,
    antiSpamEnabled: config.antiSpamEnabled,
    scannedCount: scannedIds.size,
    currentReadableCount: current.length,
    excludedCount: excludedIds.size,
    scannedStillReadableCount: current.filter((channel) => scannedIds.has(channel.id)).length
  };
}

module.exports = {
  parseIdList,
  scanCurrentMonitorableChannels,
  saveCurrentChannelScan,
  setMonitorAllChannels,
  shouldMonitorMessage,
  getMonitoringStatus
};
