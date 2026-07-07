const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Create or update Poly Saloon Gatekeeper configuration.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) => option.setName("welcome_channel").setDescription("Welcome channel").setRequired(false))
    .addChannelOption((option) => option.setName("rules_channel").setDescription("Rules channel").setRequired(false))
    .addChannelOption((option) => option.setName("intro_channel").setDescription("Intro channel").setRequired(false))
    .addChannelOption((option) => option.setName("mod_log_channel").setDescription("Mod log channel").setRequired(false))
    .addChannelOption((option) => option.setName("reports_channel").setDescription("Reports channel").setRequired(false))
    .addChannelOption((option) => option.setName("daily_prompt_channel").setDescription("Daily prompts channel").setRequired(false))
    .addRoleOption((option) => option.setName("new_arrival_role").setDescription("New Arrival role").setRequired(false))
    .addRoleOption((option) => option.setName("rules_accepted_role").setDescription("Rules Accepted role").setRequired(false))
    .addRoleOption((option) => option.setName("saloon_member_role").setDescription("Saloon Member role").setRequired(false))
    .addRoleOption((option) => option.setName("muted_role").setDescription("Muted role").setRequired(false))
    .addRoleOption((option) => option.setName("quarantined_role").setDescription("Quarantined role").setRequired(false))
    .addBooleanOption((option) => option.setName("anti_spam_enabled").setDescription("Enable spam protection").setRequired(false))
    .addBooleanOption((option) => option.setName("quarantine_enabled").setDescription("Quarantine users after repeated strikes").setRequired(false))
    .addBooleanOption((option) => option.setName("include_mods_in_intro_dm").setDescription("Include moderators in one-time bot intro DMs").setRequired(false))
    .addStringOption((option) => option.setName("invite_blocklist").setDescription("Comma-separated invite patterns").setRequired(false))
    .addStringOption((option) => option.setName("suspicious_link_blocklist").setDescription("Comma-separated suspicious link patterns").setRequired(false)),

  new SlashCommandBuilder()
    .setName("rules-post")
    .setDescription("Post the Poly Saloon rules embed with the agreement button.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("intro-template")
    .setDescription("Send yourself the Poly Saloon intro template."),

  new SlashCommandBuilder()
    .setName("intro-check")
    .setDescription("Check whether a member completed onboarding.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("Member to check").setRequired(true)),

  new SlashCommandBuilder()
    .setName("approve")
    .setDescription("Manually approve a member into Poly Saloon.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("Member to approve").setRequired(true)),

  new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a member and log the reason.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) => option.setName("user").setDescription("Member to remove").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member and log it.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("Member to timeout").setRequired(true))
    .addStringOption((option) => option.setName("duration").setDescription("Duration like 10m, 2h, or 1d").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("report")
    .setDescription("Privately report harassment, creepy DMs, spam, or rule-breaking behavior.")
    .addUserOption((option) => option.setName("user").setDescription("Member being reported").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("What happened?").setRequired(true)),

  new SlashCommandBuilder()
    .setName("prompt")
    .setDescription("Manage Poly Saloon daily prompts.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) => sub.setName("today").setDescription("Post today's discussion prompt."))
    .addSubcommand((sub) => sub
      .setName("add")
      .setDescription("Add a custom prompt.")
      .addStringOption((option) => option
        .setName("theme")
        .setDescription("Weekly theme")
        .setRequired(true)
        .addChoices(
          { name: "Money Monday", value: "Money Monday" },
          { name: "Talk It Out Tuesday", value: "Talk It Out Tuesday" },
          { name: "Wisdom Wednesday", value: "Wisdom Wednesday" },
          { name: "Thriving Thursday", value: "Thriving Thursday" },
          { name: "Future Friday", value: "Future Friday" },
          { name: "Self-Care Saturday", value: "Self-Care Saturday" },
          { name: "Sacred Sunday", value: "Sacred Sunday" }
        ))
      .addStringOption((option) => option.setName("text").setDescription("Prompt text").setRequired(true)))
    .addSubcommand((sub) => sub
      .setName("schedule")
      .setDescription("Turn daily prompt posting on or off.")
      .addBooleanOption((option) => option.setName("enabled").setDescription("Enable daily prompts").setRequired(true))
      .addStringOption((option) => option.setName("time").setDescription("24-hour HH:MM time").setRequired(false))),

  new SlashCommandBuilder()
    .setName("bot-intro")
    .setDescription("Manage the one-time Poly Saloon bot introduction DM.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) => sub.setName("preview").setDescription("Preview the exact DM message."))
    .addSubcommand((sub) => sub
      .setName("send-test")
      .setDescription("Send the bot introduction DM to one selected user.")
      .addUserOption((option) => option.setName("user").setDescription("Member to test").setRequired(true)))
    .addSubcommand((sub) => sub.setName("start").setDescription("Start the one-time DM campaign after confirmation."))
    .addSubcommand((sub) => sub.setName("status").setDescription("Show one-time DM campaign status."))
    .addSubcommand((sub) => sub.setName("stop").setDescription("Stop the one-time DM campaign safely."))
    .addSubcommand((sub) => sub
      .setName("reset-user")
      .setDescription("Reset one user's bot intro DM log for testing.")
      .addUserOption((option) => option.setName("user").setDescription("Member to reset").setRequired(true))),

  new SlashCommandBuilder()
    .setName("bot")
    .setDescription("Poly Saloon Gatekeeper help and contact.")
    .addSubcommand((sub) => sub.setName("help").setDescription("See what the bot can do."))
    .addSubcommand((sub) => sub.setName("contact").setDescription("Learn how to reach moderators."))
    .addSubcommand((sub) => sub.setName("optout-dms").setDescription("Opt out of non-critical bot DMs.")),

  new SlashCommandBuilder()
    .setName("monitor")
    .setDescription("Configure channel monitoring for moderation safety checks.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) => sub
      .setName("scan")
      .setDescription("Admin: scan current readable channels and save them for monitoring.")
      .addBooleanOption((option) => option.setName("include_logs").setDescription("Include mod-log and reports channels").setRequired(false)))
    .addSubcommand((sub) => sub
      .setName("all")
      .setDescription("Admin: turn dynamic all-channel monitoring on or off.")
      .addBooleanOption((option) => option.setName("enabled").setDescription("Monitor all readable text channels").setRequired(true)))
    .addSubcommand((sub) => sub.setName("status").setDescription("Show channel monitoring status."))
].map((command) => command.toJSON());

module.exports = { commands };
