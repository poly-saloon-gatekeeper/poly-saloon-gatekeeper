const { PermissionFlagsBits } = require("discord.js");

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function isModerator(member) {
  return member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    isAdmin(member);
}

function requireAdmin(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: "This one is for admins only.", ephemeral: true });
  }
  return null;
}

function requireModerator(interaction) {
  if (!isModerator(interaction.member)) {
    return interaction.reply({ content: "This one is for moderators only.", ephemeral: true });
  }
  return null;
}

function targetIsSelf(actorId, targetId) {
  return actorId === targetId;
}

function targetIsBot(user) {
  return Boolean(user?.bot);
}

function actorCanManageTarget(actorMember, targetMember) {
  if (!actorMember || !targetMember) return false;
  if (actorMember.guild.ownerId === actorMember.id) return true;
  return actorMember.roles.highest.comparePositionTo(targetMember.roles.highest) > 0;
}

function botCanManageTarget(guild, targetMember) {
  const botMember = guild.members.me;
  if (!botMember || !targetMember) return false;
  return botMember.roles.highest.comparePositionTo(targetMember.roles.highest) > 0;
}

module.exports = {
  isAdmin,
  isModerator,
  requireAdmin,
  requireModerator,
  targetIsSelf,
  targetIsBot,
  actorCanManageTarget,
  botCanManageTarget
};
