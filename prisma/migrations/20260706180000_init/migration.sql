CREATE TABLE "GuildConfig" (
  "guildId" TEXT NOT NULL PRIMARY KEY,
  "welcomeChannelId" TEXT,
  "rulesChannelId" TEXT,
  "introChannelId" TEXT,
  "modLogChannelId" TEXT,
  "reportsChannelId" TEXT,
  "dailyPromptChannelId" TEXT,
  "newArrivalRoleId" TEXT,
  "rulesAcceptedRoleId" TEXT,
  "saloonMemberRoleId" TEXT,
  "mutedRoleId" TEXT,
  "quarantinedRoleId" TEXT,
  "includeModeratorsInBotIntroDM" BOOLEAN NOT NULL DEFAULT false,
  "inviteBlocklist" TEXT NOT NULL DEFAULT 'discord.gg,discord.com/invite',
  "suspiciousLinkBlocklist" TEXT NOT NULL DEFAULT '',
  "antiSpamEnabled" BOOLEAN NOT NULL DEFAULT false,
  "monitorAllChannels" BOOLEAN NOT NULL DEFAULT false,
  "monitoredChannelIds" TEXT NOT NULL DEFAULT '',
  "monitorExcludedChannelIds" TEXT NOT NULL DEFAULT '',
  "quarantineEnabled" BOOLEAN NOT NULL DEFAULT false,
  "dailyPromptEnabled" BOOLEAN NOT NULL DEFAULT false,
  "dailyPromptTime" TEXT NOT NULL DEFAULT '09:00',
  "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "OnboardingUser" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "joinedAt" DATETIME NOT NULL,
  "introDeadline" DATETIME NOT NULL,
  "rulesAccepted" BOOLEAN NOT NULL DEFAULT false,
  "introCompleted" BOOLEAN NOT NULL DEFAULT false,
  "introMessageId" TEXT,
  "introChannelId" TEXT,
  "introSubmittedAt" DATETIME,
  "introValidationStatus" TEXT NOT NULL DEFAULT 'pending',
  "reminder12hSent" BOOLEAN NOT NULL DEFAULT false,
  "reminder23hSent" BOOLEAN NOT NULL DEFAULT false,
  "removedAt" DATETIME,
  "removalReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Warning" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "moderatorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Report" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Prompt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "theme" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "DailyPromptPost" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "postDate" TEXT NOT NULL,
  "promptId" TEXT,
  "channelId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ModLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "userId" TEXT,
  "moderatorId" TEXT,
  "reason" TEXT,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "BotIntroDMLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "sentAt" DATETIME,
  "failureReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "BotIntroDMCampaign" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'idle',
  "startedBy" TEXT,
  "startedAt" DATETIME,
  "stoppedAt" DATETIME,
  "finishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "OnboardingUser_guildId_userId_key" ON "OnboardingUser"("guildId", "userId");
CREATE INDEX "OnboardingUser_guildId_introDeadline_idx" ON "OnboardingUser"("guildId", "introDeadline");
CREATE INDEX "Warning_guildId_userId_idx" ON "Warning"("guildId", "userId");
CREATE INDEX "Report_guildId_targetId_idx" ON "Report"("guildId", "targetId");
CREATE INDEX "Prompt_guildId_theme_idx" ON "Prompt"("guildId", "theme");
CREATE UNIQUE INDEX "DailyPromptPost_guildId_postDate_key" ON "DailyPromptPost"("guildId", "postDate");
CREATE INDEX "DailyPromptPost_guildId_createdAt_idx" ON "DailyPromptPost"("guildId", "createdAt");
CREATE INDEX "ModLog_guildId_action_idx" ON "ModLog"("guildId", "action");
CREATE UNIQUE INDEX "BotIntroDMLog_guildId_userId_key" ON "BotIntroDMLog"("guildId", "userId");
CREATE INDEX "BotIntroDMLog_guildId_status_idx" ON "BotIntroDMLog"("guildId", "status");
CREATE UNIQUE INDEX "BotIntroDMCampaign_guildId_key" ON "BotIntroDMCampaign"("guildId");
