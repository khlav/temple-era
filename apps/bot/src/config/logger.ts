import pino from "pino";
import { config } from "./env.js";

// Note: there used to be a second, hand-rolled console logger selected by
// `process.env.RAILWAY_ENVIRONMENT === "production"`. It was dead code — the bot
// runs on Northflank, which never sets that variable — so production always got
// the real logger anyway.
//
// It was removed rather than repaired. Its stated purpose was saving memory, but
// importing the logging library costs its own weight whether or not a logger is
// ever constructed; the instance itself is tiny. So the shim avoided a few
// percent while giving up timestamps, honouring `logLevel` (its `debug` was a
// hardcoded no-op), and — most importantly — the uncaught exception and
// rejection handling below.

/*
 * Writes are synchronous. The uncaught-exception handler below logs and then exits, and an
 * asynchronous destination can lose that final record on the way out — which would turn a
 * crash into a silent disappearance, the single worst outcome for a process whose only
 * failure signal is its log output. The bot's volume is a handful of lines per raid, so
 * the cost of sync writes is irrelevant here.
 */
const destination = pino.destination({ dest: 1, sync: true });

export const logger = pino(
  {
    level: config.logLevel,
    /*
     * ISO timestamps rather than pino's default epoch milliseconds. Operators read these
     * directly: docs/phase-5-bot-cutover.md tells them to confirm a deploy by looking for
     * the startup lines in the Northflank log view, and an epoch integer makes that check
     * meaningfully harder.
     */
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  destination,
);

/*
 * Winston handled these through `handleExceptions` / `handleRejections` on its Console
 * transport, and — because `exitOnError` defaults to true — logged the error and then
 * terminated the process. pino has no equivalent built in, so the behaviour is restored
 * explicitly. Exiting is the point: Northflank restarts the container, whereas a bot left
 * running after an uncaught exception sits there holding a gateway connection it may no
 * longer be servicing.
 */
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  process.exit(1);
});
