import { z } from 'zod';

export const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const positionUpdateSchema = coordinateSchema.extend({
  heading: z.number().min(0).max(360).optional(),
  timestamp: z.string().datetime({ offset: true }).or(z.string().datetime()),
});

export const backupPositionSchema = coordinateSchema;

export const nearbyDriversQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(1).max(50000).default(3000),
});

export const tripIdParamSchema = z.object({
  trip_id: z.string().uuid(),
});

export const telemetryEventSchema = z.object({
  trip_id: z.string().uuid(),
  event_type: z.enum(['HARD_BRAKE', 'RAPID_ACCEL']),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const passengerStreamSchema = z.object({
  trip_id: z.string().uuid(),
});

export const registerTripSchema = z.object({
  trip_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  passenger_id: z.string().uuid(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).default('ACTIVE'),
});

export const updateTripStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']),
});
