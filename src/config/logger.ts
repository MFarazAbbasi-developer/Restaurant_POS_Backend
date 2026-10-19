import fs from 'node:fs';
import path from 'node:path';
import pino, { type LoggerOptions, type DestinationStream } from 'pino';
import { env } from './env.js';

const pinoOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: {
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

/**
 * Resolve optional file destination under the persistent LOG_DIR.
 * Desktop injects LOG_DIR from the path abstraction (ProgramData / LocalAppData).
 */
function createFileDestination(): DestinationStream | undefined {
  const logDir = env.LOG_DIR || env.FARAZ_POS_LOG_DIR;
  if (!logDir) {
    return undefined;
  }

  try {
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'backend.log');
    return pino.destination({ dest: logFile, sync: false, mkdir: true });
  } catch (err) {
    console.error('[logger] Failed to open LOG_DIR file destination:', err);
    return undefined;
  }
}

const fileDestination = createFileDestination();

function createLogger() {
  if (env.NODE_ENV === 'development' && !fileDestination) {
    return pino({
      ...pinoOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  if (fileDestination) {
    // stdout (for Electron pipe) + persistent file (survives upgrades)
    return pino(
      pinoOptions,
      pino.multistream([{ stream: process.stdout }, { stream: fileDestination }]),
    );
  }

  return pino(pinoOptions);
}

export const logger = createLogger();

if (fileDestination && (env.LOG_DIR || env.FARAZ_POS_LOG_DIR)) {
  logger.info(
    { logDir: env.LOG_DIR || env.FARAZ_POS_LOG_DIR },
    'Backend file logging enabled (persistent LOG_DIR)',
  );
}
