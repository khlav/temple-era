import winston from "winston";
import { config } from "./env.js";

// Detect if running on Railway (production)
const isRailway = process.env.RAILWAY_ENVIRONMENT === "production";

// Simple console logger for production (replaces Winston to save memory)
const createConsoleLogger = () => {
  const formatMessage = (level: string, message: string, metadata?: any) => {
    let msg = `${level.toUpperCase()}: ${message}`;
    if (metadata && Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  };

  return {
    info: (message: string, metadata?: any) => {
      console.log(formatMessage("info", message, metadata));
    },
    warn: (message: string, metadata?: any) => {
      console.warn(formatMessage("warn", message, metadata));
    },
    error: (message: string | Error, metadata?: any) => {
      if (message instanceof Error) {
        console.error(formatMessage("error", message.message, { ...metadata, stack: message.stack }));
      } else {
        console.error(formatMessage("error", message, metadata));
      }
    },
    debug: () => {
      // No-op in production (respects logLevel config)
    },
  };
};

// Winston logger for development
const createWinstonLogger = () => {
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

  // Create simplified format for production, prettier format for development
  const createFormat = () => {
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
  };

  const logger = winston.createLogger({
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

  // Handle uncaught exceptions and rejections
  const exceptionFormat = winston.format.combine(
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

  return logger;
};

// Export appropriate logger based on environment
export const logger = isRailway ? createConsoleLogger() : createWinstonLogger();
