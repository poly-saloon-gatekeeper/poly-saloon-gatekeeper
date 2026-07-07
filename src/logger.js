const pino = require("pino");
const env = require("./config");

module.exports = pino({
  level: env.LOG_LEVEL,
  transport: process.env.NODE_ENV === "production" ? undefined : {
    target: "pino-pretty",
    options: { colorize: true }
  }
});
