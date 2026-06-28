import Redis from 'ioredis';
import type { Env } from '../../config/env.js';

let redis: Redis | null = null;
let subscriber: Redis | null = null;

export function getRedis(env: Env): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return redis;
}

export function getRedisSubscriber(env: Env): Redis {
  if (!subscriber) {
    subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return subscriber;
}

export async function closeRedis(): Promise<void> {
  const clients = [redis, subscriber].filter(Boolean) as Redis[];
  await Promise.all(clients.map((c) => c.quit()));
  redis = null;
  subscriber = null;
}

export const RedisKeys = {
  driverPosition: (driverId: string) => `driver:position:${driverId}`,
  driverOnline: (driverId: string) => `driver:online:${driverId}`,
  tripPosition: (tripId: string) => `trip:position:${tripId}`,
  nearbyDrivers: 'drivers:nearby',
  tripChannel: (tripId: string) => `trip:updates:${tripId}`,
} as const;

export const POSITION_TTL_SECONDS = 300;
