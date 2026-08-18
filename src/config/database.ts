import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { logger } from './logger.js';

declare global {
  var __prismaInstance: PrismaClient | undefined;
}

const createPrismaClient = (): PrismaClient => {
  return new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
  });
};

export const prisma = global.__prismaInstance ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  global.__prismaInstance = prisma;
}

export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info(' Connected to PostgreSQL via Prisma');
  } catch (error) {
    logger.error({ error }, '❌ Failed to connect to PostgreSQL');
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('🔌 Disconnected from PostgreSQL');
  } catch (error) {
    logger.error({ error }, '❌ Error disconnecting from PostgreSQL');
  }
};
