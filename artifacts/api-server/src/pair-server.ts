import express, { type ErrorRequestHandler } from "express";
import { logger } from "./lib/logger";
import sessionPairRouter from "./routes/session-pair";

/**
 * Stand-alone "pairing server".
 *
 * It ONLY serves the Session ID pairing page and its API. It does not need a
 * database, Telegram, Clerk or any WhatsApp account of its own, so it can run
 * on a small free host. Start it with:
 *
 *     node artifacts/api-server/dist/pair-server.mjs
 *
 * Running this server means you want pairing on, so it is switched on by default
 * (set ENABLE_SESSION_PAIR=false to turn it off).
 */
process.env.ENABLE_SESSION_PAIR ??= "true";

const port = Number(process.env["PORT"] ?? "8080");
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "4kb" }));

app.get("/", (_req, res) => {
  res.redirect("/api/session-pair");
});
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});
app.use("/api", sessionPairRouter);

// Bad JSON etc. should answer with JSON, not an HTML error page.
const onError: ErrorRequestHandler = (_err, _req, res, _next) => {
  res.status(400).json({ error: "Bad request" });
};
app.use(onError);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Pairing server listening");
});
