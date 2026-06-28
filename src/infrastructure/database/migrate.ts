import { loadEnv } from '../../config/env.js';
import { getPool, closePool } from './pool.js';

const migrations = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS trip_breadcrumbs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_breadcrumbs_trip_id
  ON trip_breadcrumbs (trip_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL,
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('HARD_BRAKE', 'RAPID_ACCEL')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_trip_id
  ON telemetry_events (trip_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trip_contexts (
  trip_id UUID PRIMARY KEY,
  driver_id UUID NOT NULL,
  passenger_id UUID NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_contexts_driver_id ON trip_contexts (driver_id);
CREATE INDEX IF NOT EXISTS idx_trip_contexts_passenger_id ON trip_contexts (passenger_id);
`;

async function migrate(): Promise<void> {
  const env = loadEnv();
  const pool = getPool(env);
  await pool.query(migrations);
  console.log('Migrations applied successfully');
  await closePool();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
