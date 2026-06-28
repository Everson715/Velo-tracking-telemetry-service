import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import type { Env } from '../../config/env.js';
import { getPool } from '../../infrastructure/database/pool.js';
import { getRedis } from '../../infrastructure/redis/redis.client.js';

export function createHealthRoutes(env: Env): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    app.get('/health', async (_request, reply) => {
      const checks: Record<string, string> = { service: 'ok' };

      try {
        const pool: pg.Pool = getPool(env);
        await pool.query('SELECT 1');
        checks.database = 'ok';
      } catch {
        checks.database = 'error';
      }

      try {
        const redis = getRedis(env);
        await redis.ping();
        checks.redis = 'ok';
      } catch {
        checks.redis = 'error';
      }

      const healthy = Object.values(checks).every((v) => v === 'ok');
      return reply.status(healthy ? 200 : 503).send({
        status: healthy ? 'healthy' : 'degraded',
        service: 'tracking-telemetry-service',
        checks,
        timestamp: new Date().toISOString(),
      });
    });
  };
}
