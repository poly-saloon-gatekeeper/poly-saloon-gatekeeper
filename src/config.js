require("dotenv").config();
const { z } = require("zod");

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  ENFORCEMENT_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  DAILY_PROMPT_TIME: z.string().default("09:00"),
  TIMEZONE: z.string().default("America/New_York"),
  LOG_LEVEL: z.string().default("info"),
  PORT: z.coerce.number().int().positive().default(3000),
  HEALTHCHECK_ENABLED: z.coerce.boolean().default(true)
});

const env = envSchema.safeParse(process.env);

if (!env.success) {
  console.error("Missing or invalid environment variables:", env.error.flatten().fieldErrors);
  process.exit(1);
}

module.exports = env.data;
