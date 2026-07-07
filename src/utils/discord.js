async function safeSend(target, payload) {
  try {
    return await target.send(payload);
  } catch {
    return null;
  }
}

async function safeRoleAdd(member, roleId) {
  if (!roleId || member.roles.cache.has(roleId)) return false;
  return member.roles.add(roleId).then(() => true).catch(() => false);
}

async function safeRoleRemove(member, roleId) {
  if (!roleId || !member.roles.cache.has(roleId)) return false;
  return member.roles.remove(roleId).then(() => true).catch(() => false);
}

function channelMention(id, fallback) {
  return id ? `<#${id}>` : fallback;
}

function roleMention(id, fallback) {
  return id ? `<@&${id}>` : fallback;
}

module.exports = { safeSend, safeRoleAdd, safeRoleRemove, channelMention, roleMention };
