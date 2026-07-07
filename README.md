# Poly Saloon Gatekeeper

Poly Saloon Gatekeeper is a Discord bot for the Poly Saloon community. It handles onboarding, rules acceptance, intro validation, 24-hour removal, moderator logging, private reports, warnings, timeouts, daily prompts, spam strikes, and optional quarantine.

It is intentionally scoped to Poly Saloon only. There are no business, trading, ecommerce, gaming, YouTube, Twitch, or real estate features.

## Features

- Assigns `New Arrival` when a member joins.
- Records onboarding deadline in SQLite through Prisma.
- Welcomes new members in the configured welcome channel and by DM when possible.
- Posts a rules embed with an `I Agree to the Rules` button.
- Gives `Rules Accepted` when rules are accepted.
- Validates intros in the configured introductions channel only.
- Requires all intro labels and a clear numeric age.
- Removes under-18 users and logs the action.
- Does not store sensitive intro answers.
- Gives `Saloon Member` and removes `New Arrival` after rules and intro are complete.
- Sends 12-hour and 23-hour reminders.
- Removes incomplete onboarding after 24 hours.
- Supports reports, warnings, timeouts, removals, manual approvals, mod logs, daily prompts, optional anti-spam strikes, invite blocking, suspicious-link blocking, and quarantine.
- Supports a one-time bot introduction DM for existing members, sent slowly with success/failure logging and opt-out support.

## Requirements

- Node.js 20.11 or newer
- A Discord application and bot token
- SQLite for local development
- Message Content Intent enabled in the Discord Developer Portal

## Discord Bot Permissions

Give the bot these permissions:

- Manage Roles
- Kick Members
- Moderate Members
- Send Messages
- Read Message History
- Use Slash Commands
- Manage Messages, if spam moderation is enabled
- View Channels

The bot role must be above these roles in your server role list:

- New Arrival
- Rules Accepted
- Saloon Member
- Muted
- Quarantined

## Discord Developer Portal Settings

In the bot settings, enable:

- Server Members Intent
- Message Content Intent

Message content is used for the configured intro channel and for optional spam moderation.

By default, the bot only reads message content for intro validation in the configured intro channel. Broader message-content checks are used only if an admin turns on `anti_spam_enabled` with `/setup`.

Do not use message content collected by this bot to train AI models, profile members, advertise to members, or analyze sensitive identities. Message content access should stay limited to onboarding validation and optional moderation safety checks.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Fill in `.env`:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_client_id
DISCORD_GUILD_ID=your_server_id_for_fast_command_registration
DATABASE_URL="file:./dev.db"
ENFORCEMENT_INTERVAL_MINUTES=15
DAILY_PROMPT_TIME=09:00
TIMEZONE=America/New_York
LOG_LEVEL=info
```

4. Generate Prisma client and create the database:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```

5. Register slash commands:

```bash
npm run register
```

6. Start the bot:

```bash
npm start
```

## First Discord Configuration

Create these channels and roles in Discord first:

- `#the-rules`
- `#general-chat-introductions`
- `#mod-log`
- optional `#reports`
- optional `#daily-prompts`
- `New Arrival`
- `Rules Accepted`
- `Saloon Member`
- optional `Muted`
- optional `Quarantined`

Then run `/setup` and provide the channel and role options. You can run `/setup` again later with only the fields you want to change.

When `/setup` saves, the bot warns you if its bot role is not above one of the configured roles. Fix those warnings before relying on automatic approvals, quarantine, or removals.

Recommended permission design:

- `New Arrival` can see only onboarding channels.
- `Saloon Member` can see the full server.
- `Rules Accepted` can be a tracking role or used for onboarding channel permissions.
- `Quarantined` should restrict posting and visibility as your moderators prefer.

If any channel allows sexually explicit adult content, mark that Discord channel age-restricted and keep it separate from onboarding, introductions, and general channels. The bot rules intentionally prohibit explicit images in introductions and general channels.

After setup, run:

```text
/rules-post
```

The bot will post the rules embed in the configured rules channel.

## Slash Commands

- `/setup` updates channel IDs, role IDs, and moderation settings. Admin only.
- `/rules-post` posts the rules embed and agreement button. Admin only.
- `/intro-template` sends the intro template privately and ephemerally.
- `/intro-check user` checks onboarding status. Moderator only.
- `/approve user` manually approves a member. Moderator only.
- `/remove user reason` kicks and logs. Moderator only.
- `/warn user reason` warns and logs. Moderator only.
- `/timeout user duration reason` times out and logs. Moderator only.
- `/report user reason` privately reports a member to moderators.
- `/prompt today` posts today's Poly Saloon prompt. Moderator only.
- `/prompt add theme text` adds a custom prompt. Moderator only.
- `/prompt schedule enabled time` turns scheduled daily prompts on or off. Admin only.
- `/bot-intro preview` shows the exact one-time introduction DM. Moderator only.
- `/bot-intro send-test user` sends the intro DM to one selected real member for testing. Moderator only.
- `/bot-intro start` asks for confirmation, posts the public announcement, then starts the one-time DM campaign. Admin only.
- `/bot-intro status` shows eligible, sent, failed, skipped, opted-out, and remaining counts. Moderator only.
- `/bot-intro stop` stops the campaign safely. Admin only.
- `/bot-intro reset-user user` clears one member's bot intro DM log for testing. Admin only.
- `/bot help` shows what the bot does.
- `/bot contact` explains how to reach moderators or use `/report`.
- `/bot optout-dms` opts the member out of non-critical bot DMs.
- `/monitor scan` scans current readable text channels and saves them for moderation monitoring. Admin only.
- `/monitor all enabled` turns dynamic all-readable-channel monitoring on or off. Admin only.
- `/monitor status` shows channel monitoring status. Moderator only.

All moderator actions are written to the database and sent to the configured mod-log channel when one is set. Reports go to the reports channel when configured, otherwise to mod-log.

## Channel Monitoring

The bot can monitor current channels for moderation safety checks, but it does not store ordinary message content.

Recommended setup:

```text
/monitor scan
```

This scans the current readable text channels and saves their IDs for monitoring. It excludes mod-log and reports channels by default.

Then enable anti-spam checks:

```text
/setup anti_spam_enabled:true
```

To monitor future channels automatically:

```text
/monitor all enabled:true
```

Safety notes:

- Intro validation still only reads the configured intro channel.
- Anti-spam content checks only run when `anti_spam_enabled` is true.
- With `/monitor scan`, anti-spam only checks saved monitored channels.
- With `/monitor all enabled:true`, anti-spam checks readable text channels except mod-log and reports channels.
- The bot does not save ordinary message bodies. It only logs moderation actions and strike reasons.
- Use `/monitor status` to audit what mode is active.

## One-Time Bot Introduction DM

This feature introduces Poly Saloon Gatekeeper to existing members one time only. It is an operational server notice, not marketing.

Recommended rollout:

1. Preview the exact DM:

```text
/bot-intro preview
```

2. Send a test DM to yourself or a trusted moderator:

```text
/bot-intro send-test user:@YourName
```

The selected user must still be eligible for the bot-intro DM. The test command will not bypass bot, New Arrival, Quarantined, opted-out, already-sent, or missing-member-role protections. Moderators are excluded unless `/setup include_mods_in_intro_dm:true` is enabled.

3. Check campaign status:

```text
/bot-intro status
```

4. Start the campaign:

```text
/bot-intro start
```

The bot will ask for confirmation with a button before sending anything. After confirmation, it posts a public announcement in the current channel, then sends DMs slowly through a queue.

5. Stop the campaign if needed:

```text
/bot-intro stop
```

6. Reset one user only for testing:

```text
/bot-intro reset-user user:@MemberName
```

Duplicate protection:

- Members marked `sent` will not receive another campaign DM.
- Members marked `opted_out` will not receive non-critical bot DMs.
- Members marked `failed` or `skipped` are also treated as final for duplicate prevention.
- If a test needs to be repeated, an admin must use `/bot-intro reset-user user` for that one member.
- The campaign is restart-safe because send status is stored in SQLite.

Eligibility:

- Real members only, never bots.
- Must still be in the server.
- Must not be marked `sent` or `opted_out`.
- Must not have the `New Arrival` role.
- Must not have the `Quarantined` role.
- Must have the configured `Saloon Member` role when one is configured.
- Moderators are excluded by default. Admins can include them with `/setup include_mods_in_intro_dm:true`.

The bot sends no faster than one DM every 5 to 10 seconds. This is slower than Discord's hard limits on purpose: it is more respectful, lowers rate-limit risk, and keeps the server notice from feeling spammy.

Discord safety note: the bot-intro DM is intended as a one-time operational notice directly related to the bot's server function. Do not use it for ads, promotions, repeated notices, or unrelated announcements.

## Intro Validation

The bot checks that these labels are present:

```text
Name/Nickname:
Age:
Sexuality:
Gender:
Relationship Status:
Looking For / Dynamic:
Favorite Color:
Favorite Food:
Location:
Bookworm or Movie Lover:
Favorite Activities:
Do You Smoke:
Drink:
DMs Open or Closed:
Pictures of Me:
```

The bot only stores:

- whether intro is complete
- intro message ID
- intro channel ID
- intro timestamp
- validation status

It does not store sexuality, gender, relationship status, location, age answer text, photos, favorite food, favorite color, smoking, drinking, dynamic, or any other sensitive intro response.

If a member already has the `Saloon Member` role and no longer has `New Arrival`, the cleanup job treats them as approved and will not kick them for an old or incomplete onboarding database record.

## Daily Prompt Themes

- Monday: Money Monday
- Tuesday: Talk It Out Tuesday
- Wednesday: Wisdom Wednesday
- Thursday: Thriving Thursday
- Friday: Future Friday
- Saturday: Self-Care Saturday
- Sunday: Sacred Sunday

Default prompts are seeded automatically when prompts are used. Add custom prompts with `/prompt add`.

Daily prompt scheduling:

- Configure the channel with `/setup daily_prompt_channel:#daily-prompts`.
- Turn the schedule on with `/prompt schedule enabled:true time:09:00`.
- Times must use valid 24-hour `HH:MM` format.
- The scheduler uses the configured timezone, defaulting to `America/New_York`.
- The bot records one daily prompt post per local date, so restarts or repeated scheduler checks do not create duplicate daily prompts.
- `/prompt today` also respects duplicate protection and will skip if today's prompt has already been posted.

## Production Notes

- Use a managed process runner such as systemd, PM2, Docker, or your host's service manager.
- Use `npm run prisma:deploy` for production migrations.
- Keep `.env` out of version control.
- Never paste your bot token into Discord, logs, screenshots, or support chats. The token belongs only in `.env`.
- Back up the SQLite database regularly, or switch Prisma to Postgres for higher reliability.
- Make sure the bot role stays above onboarding and moderation roles.
- Review channel permissions after every role change.
- For global slash commands, remove `DISCORD_GUILD_ID`; global command updates can take longer to appear.

The 24-hour cleanup job uses the persisted SQLite database, so deadlines survive a bot restart. When the bot comes back online, it immediately checks pending onboarding records and then repeats on the configured interval.

## How to Deploy This Bot

The bot can run as a Docker service on Railway, Render, a VPS, or any host that supports long-running Node.js processes. A `Dockerfile` and `.dockerignore` are included.

Production start command:

```bash
npm run start:prod
```

That command applies Prisma migrations with `prisma migrate deploy`, then starts the bot.

Health check:

```text
/healthz
```

The health endpoint returns `200` when Discord is connected and the bot is ready. Set `HEALTHCHECK_ENABLED=false` if your host does not need an HTTP health route.

### Production Environment Variables

Set these in your host dashboard, not in source control:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_client_id
DISCORD_GUILD_ID=your_server_id_optional_but_recommended_for_first_setup
DATABASE_URL=file:/data/poly-saloon.db
ENFORCEMENT_INTERVAL_MINUTES=15
DAILY_PROMPT_TIME=09:00
TIMEZONE=America/New_York
LOG_LEVEL=info
PORT=3000
HEALTHCHECK_ENABLED=true
```

For SQLite, `DATABASE_URL` must point inside persistent storage. Do not use `file:./dev.db` in production unless that path is on a persistent disk.

### Persistent Database Notes

The database stores onboarding deadlines, intro completion status, mod logs, reports, warnings, prompt history, and bot-intro DM progress. If the database file is lost, the bot loses that operational memory.

Use one of these production options:

- SQLite with a persistent disk or volume.
- Postgres by changing the Prisma datasource provider and `DATABASE_URL`, then creating a new migration.

If using SQLite:

- Run only one bot instance. SQLite plus a single persistent disk is not a horizontal scaling setup.
- Put the database on a mounted volume, such as `/data/poly-saloon.db` or `/app/storage/poly-saloon.db`.
- Back up the database regularly.

Restart safety:

- Onboarding deadlines are stored in `OnboardingUser`; after restart, the bot immediately checks pending members.
- Moderation logs are stored in `ModLog`.
- Daily prompt duplicate protection is stored in `DailyPromptPost`.
- Bot introduction DM progress is stored in `BotIntroDMLog`.
- Bot introduction campaign state is stored in `BotIntroDMCampaign`; if the bot restarts while a campaign is running, it resumes pending DMs. If an admin used `/bot-intro stop`, it stays stopped after restart.

### Prisma Migrations

For local development:

```bash
npm run prisma:migrate -- --name your_change_name
```

For production:

```bash
npm run prisma:deploy
```

The Docker production command already runs `npm run prisma:deploy` before starting the bot.

When you change `prisma/schema.prisma`, create and commit a migration folder under `prisma/migrations/`. Do not rely on `prisma db push` for production.

### Railway Deployment

Railway detects a root `Dockerfile` by default and builds from it. Railway also supports volumes; use one for SQLite so the database survives deploys and restarts.

Recommended Railway setup:

1. Create a new Railway project from the repo.
2. Make sure the service uses the included `Dockerfile`.
3. Add a volume mounted at:

```text
/data
```

4. Set `DATABASE_URL`:

```env
DATABASE_URL=file:/data/poly-saloon.db
```

5. Add all required Discord environment variables.
6. Set the health check path to:

```text
/healthz
```

7. Deploy.
8. Run slash command registration once:

```bash
npm run register
```

You can run registration locally with the same env vars, or in a Railway shell if available.

### Render Deployment

Render supports Docker services and persistent disks. For Docker services, a disk can be mounted under the Docker `WORKDIR`; this bot uses `/app`, so `/app/storage` is a good SQLite disk path.

Recommended Render setup:

1. Create a new Web Service.
2. Choose Docker as the runtime.
3. Use the included `Dockerfile`.
4. Add a persistent disk mounted at:

```text
/app/storage
```

5. Set `DATABASE_URL`:

```env
DATABASE_URL=file:/app/storage/poly-saloon.db
```

6. Add all required Discord environment variables.
7. Set the health check path to:

```text
/healthz
```

8. Deploy.
9. Run slash command registration once:

```bash
npm run register
```

Render persistent disks are attached to a single service instance. Keep the bot scaled to one instance when using SQLite.

### Docker Locally

Build:

```bash
docker build -t poly-saloon-gatekeeper .
```

Run with a local persistent folder:

```bash
docker run --env-file .env -p 3000:3000 -v poly-saloon-data:/data poly-saloon-gatekeeper
```

Use this `DATABASE_URL` with the command above:

```env
DATABASE_URL=file:/data/poly-saloon.db
```

## Project Structure

```text
prisma/schema.prisma
src/index.js
src/register-commands.js
src/commands/
src/events/
src/jobs/
src/services/
src/utils/
```

## Phase Coverage

- Phase 1: onboarding, rules button, intro validation, and 24-hour removal are implemented.
- Phase 2: mod logs, reports, warnings, removals, and timeouts are implemented.
- Phase 3: daily prompt scheduler and prompt commands are implemented.
- Phase 4: anti-spam, invite/suspicious link blocking, strike system, and quarantine option are implemented.
- Phase 5: README, setup command, environment example, Prisma schema, and production notes are included.
