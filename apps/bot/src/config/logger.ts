import winston from "winston";
import { config } from "./env.js";

// Note: there used to be a second, hand-rolled console logger selected by
// `process.env.RAILWAY_ENVIRONMENT === "production"`. It was dead code — the bot
// runs on Northflank, which never sets that variable — so production always got
// Winston anyway.
//
// It was removed rather than repaired. Its stated purpose was saving memory, but
// `import winston` above costs ~2.6 MB whether or not a Winston logger is ever
// constructed; the instance itself is ~140 KB. So the shim avoided ~5% of the
// cost while giving up timestamps, honouring `logLevel` (its `debug` was a
// hardcoded no-op), and — most importantly — Winston's uncaught exception and
// rejection handling below.

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "white",
  debug: "gray",
};

winston.addColors(colors);

const createFormat = () =>
  winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
      let msg = `[${timestamp}] ${level}: ${message}`;
      if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
      }
      return msg;
    }),
  );

export const logger = winston.createLogger({
  level: config.logLevel,
  levels,
  format: createFormat(),
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

const exceptionFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`),
);

logger.exceptions.handle(
  new winston.transports.Console({
    format: exceptionFormat,
  }),
);

logger.rejections.handle(
  new winston.transports.Console({
    format: exceptionFormat,
  }),
);
