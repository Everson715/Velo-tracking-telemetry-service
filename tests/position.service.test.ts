import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PositionService } from '../src/domain/services/tracking.services.js';
import type { Env } from '../src/config/env.js';

const env: Env = {
  PORT: 3003,
  NODE_ENV: 'test',
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'test-secret-key',
  JWT_ISSUER: 'velo-identity',
  JWT_AUDIENCE: 'velo-platform',
  MAX_GPS_JUMP_METERS: 500,
};

describe('PositionService', () => {
  const cache = {
    getDriverPosition: vi.fn(),
    setDriverPosition: vi.fn(),
    setTripPosition: vi.fn(),
    publishTripUpdate: vi.fn(),
    setDriverOffline: vi.fn(),
  };
  const breadcrumbs = { insert: vi.fn() };
  const tripContexts = { findActiveByDriverId: vi.fn(), findByTripId: vi.fn() };

  let service: PositionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PositionService(
      env,
      cache as never,
      breadcrumbs as never,
      tripContexts as never,
    );
  });

  it('rejects stale timestamps (RN-001)', async () => {
    cache.getDriverPosition.mockResolvedValue({
      driver_id: 'd1',
      lat: -23.55,
      lng: -46.63,
      last_updated: '2026-06-28T12:00:00.000Z',
      online: true,
    });

    const result = await service.processDriverPosition('d1', {
      lat: -23.551,
      lng: -46.631,
      timestamp: '2026-06-28T11:59:00.000Z',
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('Stale timestamp');
    expect(cache.setDriverPosition).not.toHaveBeenCalled();
  });

  it('rejects unrealistic GPS jumps', async () => {
    cache.getDriverPosition.mockResolvedValue({
      driver_id: 'd1',
      lat: -23.55,
      lng: -46.63,
      last_updated: '2026-06-28T12:00:00.000Z',
      online: true,
    });

    const result = await service.processDriverPosition('d1', {
      lat: -22.0,
      lng: -45.0,
      timestamp: '2026-06-28T12:00:05.000Z',
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('GPS jump');
  });

  it('accepts valid position updates', async () => {
    cache.getDriverPosition.mockResolvedValue(null);
    tripContexts.findActiveByDriverId.mockResolvedValue(null);

    const result = await service.processDriverPosition('d1', {
      lat: -23.5505,
      lng: -46.6333,
      timestamp: '2026-06-28T12:00:00.000Z',
    });

    expect(result.accepted).toBe(true);
    expect(cache.setDriverPosition).toHaveBeenCalledOnce();
  });
});
