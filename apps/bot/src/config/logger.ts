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

// Detect if running on Railway (production)
const isRailway = process.env.RAILWAY_ENVIRONMENT === "production";

// Create simplified format for production, prettier format for development
const createFormat = () => {
  if (isRailway) {
    // Production: simple, no colorize, no timestamp (Railway adds its own)
    return winston.format.printf(({ level, message, ...metadata }) => {
      let msg = `${level}: ${message}`;
      if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
      }
      return msg;
    });
  } else {
    // Development: formatted with timestamp and colors
    return winston.format.combine(
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
      })
    );
  }
};

// Create the logger
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

// Handle uncaught exceptions and rejections with simplified format
const exceptionFormat = isRailway
  ? winston.format.printf(({ level, message }) => `${level}: ${message}`)
  : winston.format.combine(
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      winston.format.colorize(),
      winston.format.printf(
        ({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`
      )
    );

logger.exceptions.handle(
  new winston.transports.Console({
    format: exceptionFormat,
  })
);

logger.rejections.handle(
  new winston.transports.Console({
    format: exceptionFormat,
  })
);
