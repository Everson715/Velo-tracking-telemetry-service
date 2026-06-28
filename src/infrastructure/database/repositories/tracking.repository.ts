import type pg from 'pg';
import type { Breadcrumb, TelemetryEventInput, TripContext, TripStatus } from '../../../domain/types/index.js';

export class BreadcrumbRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(
    tripId: string,
    lat: number,
    lng: number,
    recordedAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO trip_breadcrumbs (trip_id, latitude, longitude, recorded_at)
       VALUES ($1, $2, $3, $4)`,
      [tripId, lat, lng, recordedAt],
    );
  }

  async findByTripId(tripId: string): Promise<Breadcrumb[]> {
    const result = await this.pool.query<{
      latitude: number;
      longitude: number;
      recorded_at: Date;
    }>(
      `SELECT latitude, longitude, recorded_at
       FROM trip_breadcrumbs
       WHERE trip_id = $1
       ORDER BY recorded_at ASC`,
      [tripId],
    );

    return result.rows.map((row) => ({
      lat: row.latitude,
      lng: row.longitude,
      timestamp: row.recorded_at.toISOString(),
    }));
  }
}

export class TelemetryRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(event: TelemetryEventInput): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO telemetry_events (trip_id, event_type, latitude, longitude)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [event.trip_id, event.event_type, event.lat ?? null, event.lng ?? null],
    );
    return result.rows[0].id;
  }
}

export class TripContextRepository {
  constructor(private readonly pool: pg.Pool) {}

  async upsert(context: TripContext): Promise<void> {
    await this.pool.query(
      `INSERT INTO trip_contexts (trip_id, driver_id, passenger_id, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (trip_id) DO UPDATE SET
         driver_id = EXCLUDED.driver_id,
         passenger_id = EXCLUDED.passenger_id,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [context.trip_id, context.driver_id, context.passenger_id, context.status],
    );
  }

  async findByTripId(tripId: string): Promise<TripContext | null> {
    const result = await this.pool.query<{
      trip_id: string;
      driver_id: string;
      passenger_id: string;
      status: TripStatus;
    }>(
      `SELECT trip_id, driver_id, passenger_id, status FROM trip_contexts WHERE trip_id = $1`,
      [tripId],
    );
    return result.rows[0] ?? null;
  }

  async updateStatus(tripId: string, status: TripStatus): Promise<void> {
    await this.pool.query(
      `UPDATE trip_contexts SET status = $2, updated_at = NOW() WHERE trip_id = $1`,
      [tripId, status],
    );
  }

  async findActiveByDriverId(driverId: string): Promise<TripContext | null> {
    const result = await this.pool.query<{
      trip_id: string;
      driver_id: string;
      passenger_id: string;
      status: TripStatus;
    }>(
      `SELECT trip_id, driver_id, passenger_id, status
       FROM trip_contexts
       WHERE driver_id = $1 AND status = 'ACTIVE'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [driverId],
    );
    return result.rows[0] ?? null;
  }
}
