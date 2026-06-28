/**
 * Utility script to generate demo JWT tokens for local testing.
 * Usage: npx tsx scripts/generate-token.ts driver <user-id>
 */
import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-in-production';
const issuer = process.env.JWT_ISSUER ?? 'velo-identity';
const audience = process.env.JWT_AUDIENCE ?? 'velo-platform';

const role = (process.argv[2] ?? 'driver') as 'driver' | 'passenger' | 'admin';
const sub = process.argv[3] ?? '00000000-0000-4000-8000-000000000001';

const token = jwt.sign(
  {
    sub,
    roles: [role],
  },
  secret,
  {
    issuer,
    audience,
    expiresIn: '24h',
  },
);

console.log(token);
