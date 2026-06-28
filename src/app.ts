import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import type { Env } from './config/env.js';
import { AppError } from './shared/errors/app-error.js';
import { getPool } from './infrastructure/database/pool.js';
import { getRedis } from './infrastructure/redis/redis.client.js';
import {
  BreadcrumbRepository,
  TelemetryRepository,
  TripContextRepository,
} from './infrastructure/database/repositories/tracking.repository.js';
import { PositionCacheRepository } from './infrastructure/redis/position-cache.repository.js';
import {
  DriverLocationService,
  PositionService,
  TelemetryService,
  TripContextService,
} from './domain/services/tracking.services.js';
import { createHealthRoutes } from './application/routes/health.routes.js';
import { createTrackingRoutes } from './application/routes/tracking.routes.js';
import { registerDriverStream, registerPassengerStream } from './application/websockets/tracking.streams.js';

export async function buildApp(env: Env) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  await app.register(cors, { origin: true });
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    verify: {
      allowedIss: env.JWT_ISSUER,
      allowedAud: env.JWT_AUDIENCE,
    },
  });
  await app.register(websocket);

  const pool = getPool(env);
  const redis = getRedis(env);
  const cache = new PositionCacheRepository(redis);
  const breadcrumbs = new BreadcrumbRepository(pool);
  const telemetryRepo = new TelemetryRepository(pool);
  const tripContexts = new TripContextRepository(pool);

  const tripContextService = new TripContextService(tripContexts);
  const positionService = new PositionService(env, cache, breadcrumbs, tripContexts);
  const driverLocationService = new DriverLocationService(cache);
  const telemetryService = new TelemetryService(telemetryRepo, tripContextService);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
      });
    }

    if ((error as { validation?: unknown }).validation) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: (error as { validation: unknown }).validation,
      });
    }

    app.log.error(error);
    return reply.status(500).send({ error: 'Internal server error' });
  });

  await app.register(createHealthRoutes(env));
  await app.register(
    createTrackingRoutes({
      env,
      positionService,
      driverLocationService,
      telemetryService,
      tripContextService,
    }),
  );

  registerDriverStream(app, env, positionService);
  registerPassengerStream(app, env, { positionService, tripContextService });

  return app;
}
