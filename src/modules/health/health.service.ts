import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  environment: string;
  services: {
    database: {
      status: 'connected' | 'disconnected';
      latencyMs?: number;
      error?: string;
    };
    memory: {
      heapUsedMb: number;
      heapTotalMb: number;
      rssMb: number;
    };
  };
}

export class HealthService {
  public async getHealth(): Promise<HealthCheckResult> {
    const memoryUsage = process.memoryUsage();
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';
    let dbLatencyMs: number | undefined;
    let dbError: string | undefined;

    const startTime = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - startTime;
      dbStatus = 'connected';
    } catch (err) {
      dbError = err instanceof Error ? err.message : 'Database ping failed';
      logger.warn({ error: err }, 'Health check database ping failed');
    }

    const overallStatus: 'healthy' | 'degraded' | 'unhealthy' =
      dbStatus === 'connected' ? 'healthy' : 'degraded';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV ?? 'development',
      services: {
        database: {
          status: dbStatus,
          ...(dbLatencyMs !== undefined && { latencyMs: dbLatencyMs }),
          ...(dbError !== undefined && { error: dbError }),
        },
        memory: {
          heapUsedMb: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100,
          heapTotalMb: Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100,
          rssMb: Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100,
        },
      },
    };
  }
}

export const healthService = new HealthService();
