async function safeSend(target, payload) {
  try {
    return await target.send(payload);
  } catch {
    return null;
  }
}

async function safeRoleAdd(member, roleId) {
  if (!roleId || member.roles.cache.has(roleId)) return false;
  if (typeof member.roles.add !== "function") return false;
  try {
    await member.roles.add(roleId);
    return true;
  } catch {
    return false;
  }
}

async function safeRoleRemove(member, roleId) {
  if (!roleId || !member.roles.cache.has(roleId)) return false;
  if (typeof member.roles.remove !== "function") return false;
  try {
    await member.roles.remove(roleId);
    return true;
  } catch {
    return false;
  }
}

function channelMention(id, fallback) {
  return id ? `<#${id}>` : fallback;
}

function roleMention(id, fallback) {
  return id ? `<@&${id}>` : fallback;
}

module.exports = { safeSend, safeRoleAdd, safeRoleRemove, channelMention, roleMention };
