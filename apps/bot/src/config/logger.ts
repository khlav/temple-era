import winston from "winston";
import { config } from "./env.js";

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Define colors for each level
const colors = {
  error: "red",
  warn: "yellow",
  info: "white",
  debug: "gray",
};

// Add colors to winston
winston.addColors(colors);

// Detect if running on Railway
const isRailway = process.env.RAILWAY_ENVIRONMENT === "production";

// Create the logger
export const logger = winston.createLogger({
  level: config.logLevel,
  levels,
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
      // Only include timestamp when not on Railway (Railway adds its own)
      const timestampPart = isRailway ? "" : `[${timestamp}] `;
      let msg = `${timestampPart}${level}: ${message}`;

      // Add metadata if present
      if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
      }

      return msg;
    })
  ),
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

// Handle uncaught exceptions and rejections
logger.exceptions.handle(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message }) => {
        // Only include timestamp when not on Railway (Railway adds its own)
        const timestampPart = isRailway ? "" : `[${timestamp}] `;
        return `${timestampPart}${level}: ${message}`;
      })
    ),
  })
);

logger.rejections.handle(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message }) => {
        // Only include timestamp when not on Railway (Railway adds its own)
        const timestampPart = isRailway ? "" : `[${timestamp}] `;
        return `${timestampPart}${level}: ${message}`;
      })
    ),
  })
);
