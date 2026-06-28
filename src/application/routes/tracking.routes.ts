import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { Env } from '../../config/env.js';
import {
  backupPositionSchema,
  nearbyDriversQuerySchema,
  registerTripSchema,
  telemetryEventSchema,
  tripIdParamSchema,
  updateTripStatusSchema,
} from '../schemas/tracking.schemas.js';
import { extractToken, requireRoles, assertTripOwnership } from '../../infrastructure/auth/auth.helpers.js';
import type { JwtPayload } from '../../domain/types/index.js';
import {
  DriverLocationService,
  PositionService,
  TelemetryService,
  TripContextService,
} from '../../domain/services/tracking.services.js';

export interface TrackingRouteDeps {
  env: Env;
  positionService: PositionService;
  driverLocationService: DriverLocationService;
  telemetryService: TelemetryService;
  tripContextService: TripContextService;
}

export function createTrackingRoutes(deps: TrackingRouteDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    app.post('/tracking/update-position', async (request, reply) => {
      const token = extractToken(request);
      const payload = app.jwt.verify<JwtPayload>(token);
      requireRoles(payload, 'driver');

      const body = backupPositionSchema.parse(request.body);
      const result = await deps.positionService.processBackupPosition(
        payload.sub,
        body.lat,
        body.lng,
      );

      if (!result.accepted) {
        return reply.status(409).send({ accepted: false, reason: result.reason });
      }

      return reply.status(200).send({ accepted: true });
    });

    app.get('/tracking/drivers/nearby', async (request, reply) => {
      const token = extractToken(request);
      const payload = app.jwt.verify<JwtPayload>(token);
      requireRoles(payload, 'passenger', 'admin');

      const query = nearbyDriversQuerySchema.parse(request.query);
      const drivers = await deps.driverLocationService.findNearby(
        query.lat,
        query.lng,
        query.radius,
      );

      return reply.send(drivers);
    });

    app.get('/tracking/trip/:trip_id/current', async (request, reply) => {
      const token = extractToken(request);
      const payload = app.jwt.verify<JwtPayload>(token);
      requireRoles(payload, 'passenger', 'driver', 'admin');

      const { trip_id } = tripIdParamSchema.parse(request.params);
      const trip = await deps.tripContextService.getTrip(trip_id);

      if (!payload.roles.includes('admin')) {
        if (payload.roles.includes('passenger')) {
          assertTripOwnership(payload, trip.passenger_id);
        } else if (payload.roles.includes('driver') && payload.sub !== trip.driver_id) {
          return reply.status(403).send({ error: 'Forbidden' });
        }
      }

      const position = await deps.positionService.getTripCurrentPosition(trip_id);
      return reply.send(position);
    });

    app.post('/tracking/events', async (request, reply) => {
      const token = extractToken(request);
      const payload = app.jwt.verify<JwtPayload>(token);
      requireRoles(payload, 'driver');

      const body = telemetryEventSchema.parse(request.body);
      const trip = await deps.tripContextService.getTrip(body.trip_id);

      if (payload.sub !== trip.driver_id && !payload.roles.includes('admin')) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const event = await deps.telemetryService.registerEvent(body);
      return reply.status(201).send(event);
    });

    app.get('/tracking/history/:trip_id', async (request, reply) => {
      const token = extractToken(request);
      const payload = app.jwt.verify<JwtPayload>(token);
      requireRoles(payload, 'passenger', 'driver', 'admin');

      const { trip_id } = tripIdParamSchema.parse(request.params);
      const trip = await deps.tripContextService.getTrip(trip_id);

      if (!payload.roles.includes('admin')) {
        if (payload.roles.includes('passenger')) {
          assertTripOwnership(payload, trip.passenger_id);
        } else if (payload.roles.includes('driver') && payload.sub !== trip.driver_id) {
          return reply.status(403).send({ error: 'Forbidden' });
        }
      }

      const history = await deps.positionService.getTripHistory(trip_id);
      return reply.send(history);
    });

    // Internal endpoints for trip-matching-service integration
    app.post('/internal/trips', async (request, reply) => {
      const token = extractToken(request);
      const payload = app.jwt.verify<JwtPayload>(token);
      requireRoles(payload, 'admin');

      const body = registerTripSchema.parse(request.body);
      await deps.tripContextService.registerTrip(body);
      return reply.status(201).send({ registered: true });
    });

    app.patch('/internal/trips/:trip_id/status', async (request, reply) => {
      const token = extractToken(request);
      const payload = app.jwt.verify<JwtPayload>(token);
      requireRoles(payload, 'admin');

      const { trip_id } = tripIdParamSchema.parse(request.params);
      const { status } = updateTripStatusSchema.parse(request.body);
      const trip = await deps.tripContextService.updateStatus(trip_id, status);
      return reply.send({ trip_id: trip.trip_id, status: trip.status });
    });
  };
}
