/**
 * ClawBands Logger
 * Production-grade logging with Winston
 */

import winston from 'winston';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import os from 'os';

// Determine ClawBands home directory
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
const CLAWBANDS_HOME = path.join(OPENCLAW_HOME, 'clawbands');

// Ensure the clawbands directory exists
if (!existsSync(CLAWBANDS_HOME)) {
  mkdirSync(CLAWBANDS_HOME, { recursive: true });
}

const LOG_FILE = path.join(CLAWBANDS_HOME, 'clawbands.log');

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'clawbands' },
  transports: [
    // Console transport (colorized for development)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
          return `[${timestamp}] ${level}: ${message} ${metaStr}`;
        })
      ),
    }),

    // File transport (structured JSON logs)
    new winston.transports.File({
      filename: LOG_FILE,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.json(),
    }),
  ],
});

// Export the log file path for reference
export const LOG_PATH = LOG_FILE;
export const CLAWBANDS_DATA_DIR = CLAWBANDS_HOME;
