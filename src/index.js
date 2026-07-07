const { Client, GatewayIntentBits, Partials } = require("discord.js");
const cron = require("node-cron");
const env = require("./config");
const prisma = require("./db");
const logger = require("./logger");
const guildMemberAdd = require("./events/guildMemberAdd");
const interactionCreate = require("./events/interactionCreate");
const messageCreate = require("./events/messageCreate");
const { enforceOnboarding } = require("./services/onboardingService");
const { runDailyPromptScheduler } = require("./services/promptService");
const { resumeRunningCampaigns } = require("./services/botIntroService");
const { startHealthServer } = require("./healthServer");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

const healthServer = startHealthServer(client);

client.once("ready", async () => {
  logger.info({ tag: client.user.tag }, "Poly Saloon Gatekeeper is online");

  setInterval(
    () => enforceOnboarding(client).catch((error) => logger.error({ error }, "Onboarding enforcement failed")),
    env.ENFORCEMENT_INTERVAL_MINUTES * 60 * 1000
  );
  await enforceOnboarding(client).catch((error) => logger.error({ error }, "Initial onboarding enforcement failed"));
  await resumeRunningCampaigns(client).catch((error) => logger.error({ error }, "Bot intro campaign resume failed"));

  cron.schedule("* * * * *", () => {
    runDailyPromptScheduler(client).catch((error) => logger.error({ error }, "Daily prompt scheduler failed"));
  });
});

client.on("guildMemberAdd", guildMemberAdd);
client.on("interactionCreate", interactionCreate);
client.on("messageCreate", messageCreate);

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  logger.info("Shutting down Poly Saloon Gatekeeper");
  if (healthServer) healthServer.close();
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
}

client.login(env.DISCORD_TOKEN);
