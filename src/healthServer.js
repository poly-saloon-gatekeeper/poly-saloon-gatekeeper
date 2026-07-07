const http = require("http");
const env = require("./config");
const logger = require("./logger");

function startHealthServer(client) {
  if (!env.HEALTHCHECK_ENABLED) return null;

  const server = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      const ready = client.isReady();
      res.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({
        ok: ready,
        service: "poly-saloon-gatekeeper",
        discordReady: ready,
        uptimeSeconds: Math.floor(process.uptime())
      }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
  });

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Health check server listening");
  });

  return server;
}

module.exports = { startHealthServer };
