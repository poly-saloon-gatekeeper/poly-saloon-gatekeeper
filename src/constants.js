const CUSTOM_IDS = {
  ACCEPT_RULES: "poly_saloon_accept_rules",
  CONFIRM_BOT_INTRO_START: "poly_saloon_confirm_bot_intro_start"
};

const INTRO_LABELS = [
  "Name/Nickname:",
  "Age:",
  "Sexuality:",
  "Gender:",
  "Relationship Status:",
  "Looking For / Dynamic:",
  "Favorite Color:",
  "Favorite Food:",
  "Location:",
  "Bookworm or Movie Lover:",
  "Favorite Activities:",
  "Do You Smoke:",
  "Drink:",
  "DMs Open or Closed:",
  "Pictures of Me:"
];

const INTRO_TEMPLATE = `Name/Nickname:
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
Pictures of Me: Optional. No explicit images in introductions.`;

function buildWelcomeMessage({ rulesChannel = "#the-rules", introChannel = "#general-chat-introductions" } = {}) {
  return `Welcome in to Poly Saloon!

Start here: read ${rulesChannel} and click **I Agree to the Rules**.

After that, post your introduction in ${introChannel} so people in the community can get to know you.

Full server access requires both steps:
1. Agree to the rules.
2. Post a complete introduction.

Your introduction must be posted within 24 hours or you may be removed from the server.

Please copy and paste the template below with your own answers. This helps other poly people understand who you are, what your dynamic is, and whether they may want to connect with you.

${INTRO_TEMPLATE}

After you post your intro, the bot will check it. If anything is missing, it will tell you what to fix.`;
}

const BOT_INTRO_DM = `Hey! Welcome to Poly Saloon.

I'm the Poly Saloon Gatekeeper bot. I help keep the server organized, safe, and respectful.

Here's what I do:

1. Help new members complete onboarding.
2. Make sure new members read the rules and post an intro.
3. Remind new members if their intro is missing.
4. Help protect the server from spam, harassment, and creepy behavior.
5. Let members report problems privately.
6. Post community prompts and keep conversations active.
7. Help moderators keep Poly Saloon peaceful and respectful.

Useful commands:

/bot help - See what I can do.
/bot contact - Learn how to reach the mods.
/intro-template - Get the intro template again.
/report - Privately report harassment, spam, creepy DMs, or rule-breaking.
/bot optout-dms - Opt out of non-critical bot DMs.

Important reminder:
Poly Saloon is built on respect, honesty, consent, and grown communication. Respect people's boundaries, especially around DMs. If someone says their DMs are closed, leave them alone.

Need help? Use /bot contact or message a moderator.

This is a one-time introduction message.`;

const BOT_INTRO_ANNOUNCEMENT = `Poly Saloon update:

Our new server bot, Poly Saloon Gatekeeper, is now active. It helps with onboarding, rules, introductions, reports, moderation support, and daily community prompts.

Existing members may receive one private message from the bot explaining what it does and what commands are available. This is a one-time server notice, not a promo message.

You can use /bot help anytime to see what the bot does.`;

const BOT_HELP_MESSAGE = `Poly Saloon Gatekeeper helps with onboarding, rules, introductions, reports, moderation support, spam protection when enabled, and community prompts.

Member commands:
/bot help - See this help message.
/bot contact - Learn how to reach moderators.
/bot optout-dms - Opt out of non-critical bot DMs.
/intro-template - Get the introduction template.
/report - Privately report harassment, spam, creepy DMs, or rule-breaking.`;

const BOT_CONTACT_MESSAGE = `Need help in Poly Saloon?

Use /report to privately report harassment, spam, creepy DMs, or rule-breaking. You can also message a moderator directly if the situation needs a human.

If something feels unsafe, uncomfortable, or pressuring, you are allowed to ask for help.`;

const RULES = [
  "18+ only.",
  "Respect all relationship styles.",
  "No harassment, shaming, hate speech, threats, or bullying.",
  "Consent matters in public chat and DMs.",
  "No unsolicited sexual messages or pictures.",
  "No cold DM pressure. Respect \"DMs closed.\"",
  "No spam, scams, raids, or promo dumping.",
  "No explicit pictures in general channels or introductions.",
  "Do not share private screenshots without consent unless reporting abuse to moderators.",
  "Follow Discord's Terms, Community Guidelines, and server rules.",
  "Mods can remove anyone creating unsafe energy."
];

const WEEKLY_THEMES = {
  0: "Sacred Sunday",
  1: "Money Monday",
  2: "Talk It Out Tuesday",
  3: "Wisdom Wednesday",
  4: "Thriving Thursday",
  5: "Future Friday",
  6: "Self-Care Saturday"
};

const DEFAULT_PROMPTS = {
  "Money Monday": [
    "How do finances, fairness, and transparency show up in your poly relationships?",
    "What is one money boundary that helps you feel respected in relationships?"
  ],
  "Talk It Out Tuesday": [
    "What is a hard conversation you have learned to approach with more care?",
    "How do you know when you need reassurance versus when you need a boundary?"
  ],
  "Wisdom Wednesday": [
    "What lesson has polyamory taught you that you wish you learned earlier?",
    "What does emotional maturity look like in your current relationship season?"
  ],
  "Thriving Thursday": [
    "What helps your relationships feel alive without feeling chaotic?",
    "Where are you growing right now, inside or outside of love?"
  ],
  "Future Friday": [
    "What does a healthy relationship future look like for you this year?",
    "What dream are you learning to name more clearly?"
  ],
  "Self-Care Saturday": [
    "What kind of rest actually restores you?",
    "What boundary protects your peace the most?"
  ],
  "Sacred Sunday": [
    "What does commitment mean to you when love has room to breathe?",
    "What are you grateful for in your connections this week?"
  ]
};

module.exports = {
  CUSTOM_IDS,
  INTRO_LABELS,
  INTRO_TEMPLATE,
  buildWelcomeMessage,
  BOT_INTRO_DM,
  BOT_INTRO_ANNOUNCEMENT,
  BOT_HELP_MESSAGE,
  BOT_CONTACT_MESSAGE,
  RULES,
  WEEKLY_THEMES,
  DEFAULT_PROMPTS
};
