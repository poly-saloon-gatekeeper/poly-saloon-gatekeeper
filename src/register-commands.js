const { REST, Routes } = require("discord.js");
const env = require("./config");
const { commands } = require("./commands/definitions");

async function main() {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
  const route = env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(env.DISCORD_CLIENT_ID);

  await rest.put(route, { body: commands });
  console.log(`Registered ${commands.length} slash commands ${env.DISCORD_GUILD_ID ? "for one guild" : "globally"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
