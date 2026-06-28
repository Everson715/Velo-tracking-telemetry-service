import type { Env } from '../../config/env.js';
import type { PositionUpdate, TripContext, TripStatus } from '../types/index.js';
import { haversineDistanceMeters, isValidCoordinate } from '../utils/geo.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import type { BreadcrumbRepository, TripContextRepository } from '../../infrastructure/database/repositories/tracking.repository.js';
import type { PositionCacheRepository } from '../../infrastructure/redis/position-cache.repository.js';

export interface ProcessPositionResult {
  accepted: boolean;
  reason?: string;
}

export class PositionService {
  constructor(
    private readonly env: Env,
    private readonly cache: PositionCacheRepository,
    private readonly breadcrumbs: BreadcrumbRepository,
    private readonly tripContexts: TripContextRepository,
  ) {}

  validateCoordinate(lat: number, lng: number): void {
    if (!isValidCoordinate(lat, lng)) {
      throw new ValidationError('Invalid coordinates: latitude must be [-90,90] and longitude [-180,180]');
    }
  }

  async processDriverPosition(
    driverId: string,
    update: PositionUpdate,
  ): Promise<ProcessPositionResult> {
    this.validateCoordinate(update.lat, update.lng);

    const incomingTime = new Date(update.timestamp);
    if (Number.isNaN(incomingTime.getTime())) {
      throw new ValidationError('Invalid timestamp');
    }

    const existing = await this.cache.getDriverPosition(driverId);
    if (existing) {
      const existingTime = new Date(existing.last_updated);
      if (incomingTime < existingTime) {
        return { accepted: false, reason: 'Stale timestamp rejected (RN-001)' };
      }

      const jump = haversineDistanceMeters(
        existing.lat,
        existing.lng,
        update.lat,
        update.lng,
      );
      if (jump > this.env.MAX_GPS_JUMP_METERS) {
        return { accepted: false, reason: `GPS jump of ${Math.round(jump)}m exceeds limit` };
      }
    }

    const stored = {
      lat: update.lat,
      lng: update.lng,
      heading: update.heading,
      timestamp: incomingTime.toISOString(),
    };

    await this.cache.setDriverPosition(driverId, stored, true);

    const activeTrip = await this.tripContexts.findActiveByDriverId(driverId);
    if (activeTrip) {
      await this.cache.setTripPosition(activeTrip.trip_id, stored);
      await this.cache.publishTripUpdate(activeTrip.trip_id, stored);
      await this.breadcrumbs.insert(
        activeTrip.trip_id,
        update.lat,
        update.lng,
        incomingTime,
      );
    }

    return { accepted: true };
  }

  async processBackupPosition(
    driverId: string,
    lat: number,
    lng: number,
  ): Promise<ProcessPositionResult> {
    return this.processDriverPosition(driverId, {
      lat,
      lng,
      timestamp: new Date().toISOString(),
    });
  }

  async getTripCurrentPosition(tripId: string): Promise<{ lat: number; lng: number; last_updated: string }> {
    const position = await this.cache.getTripPosition(tripId);
    if (!position) {
      throw new NotFoundError(`No position found for trip ${tripId}`);
    }
    return {
      lat: position.lat,
      lng: position.lng,
      last_updated: position.last_updated,
    };
  }

  async getTripHistory(tripId: string) {
    const context = await this.tripContexts.findByTripId(tripId);
    if (!context) {
      throw new NotFoundError(`Trip ${tripId} not found`);
    }
    return this.breadcrumbs.findByTripId(tripId);
  }

  async setDriverOffline(driverId: string): Promise<void> {
    await this.cache.setDriverOffline(driverId);
  }
}

export class TripContextService {
  constructor(private readonly tripContexts: TripContextRepository) {}

  async registerTrip(context: TripContext): Promise<void> {
    await this.tripContexts.upsert(context);
  }

  async getTrip(tripId: string): Promise<TripContext> {
    const trip = await this.tripContexts.findByTripId(tripId);
    if (!trip) throw new NotFoundError(`Trip ${tripId} not found`);
    return trip;
  }

  assertPassengerCanStream(trip: TripContext): void {
    if (trip.status === 'COMPLETED' || trip.status === 'CANCELLED') {
      throw new ConflictError(`Trip is ${trip.status.toLowerCase()}; streaming not allowed (RN-003)`);
    }
  }

  assertActiveTripForTelemetry(trip: TripContext): void {
    if (trip.status !== 'ACTIVE') {
      throw new ConflictError('Telemetry events require an active trip (RN-002)');
    }
  }

  async updateStatus(tripId: string, status: TripStatus): Promise<TripContext> {
    await this.tripContexts.updateStatus(tripId, status);
    return this.getTrip(tripId);
  }
}

export class DriverLocationService {
  constructor(private readonly cache: PositionCacheRepository) {}

  async findNearby(lat: number, lng: number, radius: number) {
    if (!isValidCoordinate(lat, lng)) {
      throw new ValidationError('Invalid coordinates');
    }
    if (radius <= 0 || radius > 50_000) {
      throw new ValidationError('Radius must be between 1 and 50000 meters');
    }

    const nearby = await this.cache.findNearbyDrivers(lng, lat, radius);
    const drivers = await Promise.all(
      nearby.map(async ({ driverId }) => {
        const position = await this.cache.getDriverPosition(driverId);
        if (!position?.online) return null;
        return {
          driver_id: driverId,
          lat: position.lat,
          lng: position.lng,
        };
      }),
    );

    return drivers.filter((d): d is NonNullable<typeof d> => d !== null);
  }
}

export class TelemetryService {
  constructor(
    private readonly telemetryRepo: import('../../infrastructure/database/repositories/tracking.repository.js').TelemetryRepository,
    private readonly tripContextService: TripContextService,
  ) {}

  async registerEvent(
    input: import('../types/index.js').TelemetryEventInput,
  ): Promise<{ id: string }> {
    const trip = await this.tripContextService.getTrip(input.trip_id);
    this.tripContextService.assertActiveTripForTelemetry(trip);

    if (input.lat !== undefined && input.lng !== undefined) {
      if (!isValidCoordinate(input.lat, input.lng)) {
        throw new ValidationError('Invalid event coordinates');
      }
    }

    const id = await this.telemetryRepo.insert(input);
    return { id };
  }
}
