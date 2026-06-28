import { describe, expect, it } from 'vitest';
import {
  haversineDistanceMeters,
  isValidCoordinate,
  isValidLatitude,
  isValidLongitude,
} from '../src/domain/utils/geo.js';

describe('geo utilities', () => {
  it('validates latitude bounds', () => {
    expect(isValidLatitude(0)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(91)).toBe(false);
    expect(isValidLatitude(-91)).toBe(false);
  });

  it('validates longitude bounds', () => {
    expect(isValidLongitude(0)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(181)).toBe(false);
  });

  it('rejects invalid coordinates', () => {
    expect(isValidCoordinate(95, 0)).toBe(false);
    expect(isValidCoordinate(0, 200)).toBe(false);
    expect(isValidCoordinate(-23.55, -46.63)).toBe(true);
  });

  it('computes haversine distance', () => {
    const distance = haversineDistanceMeters(-23.5505, -46.6333, -23.551, -46.634);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(200);
  });
});

describe('coordinate validation schema', () => {
  it('rejects lat > 90 via zod schema', async () => {
    const { coordinateSchema } = await import('../src/application/schemas/tracking.schemas.js');
    expect(() => coordinateSchema.parse({ lat: 91, lng: 0 })).toThrow();
    expect(() => coordinateSchema.parse({ lat: -23.5, lng: -46.6 })).not.toThrow();
  });
});
