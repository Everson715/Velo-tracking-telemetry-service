import type Redis from 'ioredis';
import type { DriverPosition, TripPosition } from '../../domain/types/index.js';
import { POSITION_TTL_SECONDS, RedisKeys } from '../redis/redis.client.js';

interface StoredPosition {
  lat: number;
  lng: number;
  heading?: number;
  timestamp: string;
}

export class PositionCacheRepository {
  constructor(private readonly redis: Redis) {}

  async setDriverPosition(
    driverId: string,
    position: StoredPosition,
    online = true,
  ): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.setex(
      RedisKeys.driverPosition(driverId),
      POSITION_TTL_SECONDS,
      JSON.stringify(position),
    );
    pipeline.setex(RedisKeys.driverOnline(driverId), POSITION_TTL_SECONDS, online ? '1' : '0');
    pipeline.geoadd(RedisKeys.nearbyDrivers, position.lng, position.lat, driverId);
    await pipeline.exec();
  }

  async getDriverPosition(driverId: string): Promise<DriverPosition | null> {
    const [positionRaw, onlineRaw] = await Promise.all([
      this.redis.get(RedisKeys.driverPosition(driverId)),
      this.redis.get(RedisKeys.driverOnline(driverId)),
    ]);

    if (!positionRaw) return null;

    const position = JSON.parse(positionRaw) as StoredPosition;
    return {
      driver_id: driverId,
      lat: position.lat,
      lng: position.lng,
      heading: position.heading,
      last_updated: position.timestamp,
      online: onlineRaw === '1',
    };
  }

  async setDriverOffline(driverId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(RedisKeys.driverPosition(driverId));
    pipeline.del(RedisKeys.driverOnline(driverId));
    pipeline.zrem(RedisKeys.nearbyDrivers, driverId);
    await pipeline.exec();
  }

  async setTripPosition(tripId: string, position: StoredPosition): Promise<void> {
    await this.redis.setex(
      RedisKeys.tripPosition(tripId),
      POSITION_TTL_SECONDS,
      JSON.stringify(position),
    );
  }

  async getTripPosition(tripId: string): Promise<TripPosition | null> {
    const raw = await this.redis.get(RedisKeys.tripPosition(tripId));
    if (!raw) return null;
    const position = JSON.parse(raw) as StoredPosition;
    return {
      trip_id: tripId,
      lat: position.lat,
      lng: position.lng,
      last_updated: position.timestamp,
    };
  }

  async findNearbyDrivers(
    lng: number,
    lat: number,
    radiusMeters: number,
  ): Promise<Array<{ driverId: string; distance: number }>> {
    const results = await this.redis.georadius(
      RedisKeys.nearbyDrivers,
      lng,
      lat,
      radiusMeters,
      'm',
      'WITHDIST',
      'ASC',
    );

    const onlineDrivers: Array<{ driverId: string; distance: number }> = [];

    for (const entry of results as Array<[string, string]>) {
      const driverId = entry[0];
      const distance = parseFloat(entry[1]);
      const online = await this.redis.get(RedisKeys.driverOnline(driverId));
      if (online === '1') {
        onlineDrivers.push({ driverId, distance });
      }
    }

    return onlineDrivers;
  }

  async publishTripUpdate(tripId: string, payload: StoredPosition): Promise<void> {
    await this.redis.publish(
      RedisKeys.tripChannel(tripId),
      JSON.stringify(payload),
    );
  }
}
