import type { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';
import type { Env } from '../../config/env.js';
import { positionUpdateSchema } from '../schemas/tracking.schemas.js';
import type { JwtPayload } from '../../domain/types/index.js';
import type { PositionService, TripContextService } from '../../domain/services/tracking.services.js';
import { getRedisSubscriber, RedisKeys } from '../../infrastructure/redis/redis.client.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';

function verifyWsToken(app: FastifyInstance, token?: string): JwtPayload {
  if (!token) throw new UnauthorizedError('Missing WebSocket token');
  return app.jwt.verify<JwtPayload>(token);
}

export function registerDriverStream(
  app: FastifyInstance,
  env: Env,
  positionService: PositionService,
): void {
  app.get('/tracking/stream/driver', { websocket: true }, (socket: WebSocket, request) => {
    let driverId: string | null = null;
    const query = request.query as { token?: string };

    try {
      const payload = verifyWsToken(app, query.token);
      if (!payload.roles.includes('driver')) {
        socket.close(4403, 'Forbidden');
        return;
      }
      driverId = payload.sub;
    } catch {
      socket.close(4401, 'Unauthorized');
      return;
    }

    app.log.info({ driverId, event: 'ws_driver_connected' }, 'Driver WebSocket connected');

    socket.on('message', async (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        const update = positionUpdateSchema.parse(parsed);
        const result = await positionService.processDriverPosition(driverId!, update);

        socket.send(JSON.stringify({ accepted: result.accepted, reason: result.reason }));
      } catch (err) {
        app.log.warn({ err, driverId }, 'Invalid driver position message');
        socket.send(JSON.stringify({ accepted: false, reason: 'Invalid payload' }));
      }
    });

    socket.on('close', async () => {
      app.log.info({ driverId, event: 'ws_driver_disconnected' }, 'Driver WebSocket disconnected');
      if (driverId) {
        await positionService.setDriverOffline(driverId);
      }
    });

    socket.on('error', (err) => {
      app.log.error({ err, driverId, event: 'ws_driver_error' }, 'Driver WebSocket error');
    });
  });
}

export function registerPassengerStream(
  app: FastifyInstance,
  env: Env,
  deps: {
    positionService: PositionService;
    tripContextService: TripContextService;
  },
): void {
  app.get('/tracking/stream/passenger', { websocket: true }, async (socket: WebSocket, request) => {
    const query = request.query as { token?: string; trip_id?: string };
    let tripId: string | null = null;
    let subscriber: ReturnType<typeof getRedisSubscriber> | null = null;

    try {
      const payload = verifyWsToken(app, query.token);
      if (!payload.roles.includes('passenger')) {
        socket.close(4403, 'Forbidden');
        return;
      }

      if (!query.trip_id) {
        socket.close(4400, 'trip_id required');
        return;
      }

      tripId = query.trip_id;
      const trip = await deps.tripContextService.getTrip(tripId);

      if (payload.sub !== trip.passenger_id) {
        socket.close(4403, 'Forbidden');
        return;
      }

      deps.tripContextService.assertPassengerCanStream(trip);

      const current = await deps.positionService.getTripCurrentPosition(tripId).catch(() => null);
      if (current) {
        socket.send(JSON.stringify({ lat: current.lat, lng: current.lng, timestamp: current.last_updated }));
      }

      subscriber = getRedisSubscriber(env);
      await subscriber.subscribe(RedisKeys.tripChannel(tripId));

      subscriber.on('message', (channel, message) => {
        if (channel === RedisKeys.tripChannel(tripId!)) {
          socket.send(message);
        }
      });

      app.log.info({ tripId, passengerId: payload.sub, event: 'ws_passenger_connected' }, 'Passenger WebSocket connected');
    } catch (err) {
      app.log.warn({ err, tripId }, 'Passenger WebSocket auth failed');
      socket.close(4401, 'Unauthorized');
      return;
    }

    socket.on('close', async () => {
      app.log.info({ tripId, event: 'ws_passenger_disconnected' }, 'Passenger WebSocket disconnected');
      if (subscriber && tripId) {
        await subscriber.unsubscribe(RedisKeys.tripChannel(tripId));
      }
    });

    socket.on('error', (err) => {
      app.log.error({ err, tripId, event: 'ws_passenger_error' }, 'Passenger WebSocket error');
    });
  });
}
