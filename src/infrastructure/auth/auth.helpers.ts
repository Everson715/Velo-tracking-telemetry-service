import type { FastifyRequest } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors/app-error.js';
import type { JwtPayload, UserRole } from '../../domain/types/index.js';

export function extractToken(request: FastifyRequest): string {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const queryToken = (request.query as { token?: string }).token;
  if (queryToken) return queryToken;

  throw new UnauthorizedError('Missing authentication token');
}

export function requireRoles(payload: JwtPayload, ...roles: UserRole[]): void {
  const hasRole = roles.some((role) => payload.roles.includes(role));
  if (!hasRole) {
    throw new ForbiddenError('Insufficient permissions for this resource');
  }
}

export function assertTripOwnership(payload: JwtPayload, passengerId: string): void {
  if (payload.roles.includes('admin')) return;
  if (payload.sub !== passengerId) {
    throw new ForbiddenError('You can only access your own trip data');
  }
}
