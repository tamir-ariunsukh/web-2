import { randomBytes } from 'node:crypto';

/**
 * Environment contract.
 *
 * Parsed once at boot so a misconfigured deployment fails immediately rather
 * than at the first request that touches a missing variable. Development runs
 * with generated defaults so `npm run dev` works on a fresh clone with no `.env`.
 */

function readString(name, fallback) {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

function readBoolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  // `Boolean('false')` is true, so the textual forms are parsed explicitly.
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';

function requiredSecret(name) {
  const value = process.env[name];
  if (value && value.length >= 32) return value;
  if (isProduction) {
    throw new Error(`${name} must be set to at least 32 characters in production`);
  }
  // A random per-boot secret in development means a restart invalidates existing
  // sessions, which is preferable to shipping a well-known default.
  return randomBytes(32).toString('base64url');
}

function encryptionKey() {
  const value = process.env.PII_ENCRYPTION_KEY;
  if (value && /^[0-9a-fA-F]{64}$/.test(value)) return value;
  if (isProduction) {
    throw new Error('PII_ENCRYPTION_KEY must be 64 hex characters (32 bytes) in production');
  }
  return randomBytes(32).toString('hex');
}

let cached;

export function loadEnv() {
  if (cached) return cached;

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  cached = {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: readNumber('PORT', readNumber('API_PORT', 3000)),
    logLevel: readString('LOG_LEVEL', 'info'),

    databaseFile: readString('DATABASE_FILE', './data/airline.db'),

    jwtAccessSecret: requiredSecret('JWT_ACCESS_SECRET'),
    jwtRefreshSecret: requiredSecret('JWT_REFRESH_SECRET'),
    jwtAccessTtl: readString('JWT_ACCESS_TTL', '15m'),
    jwtRefreshTtl: readString('JWT_REFRESH_TTL', '30d'),
    piiKey: encryptionKey(),

    flightProvider: readString('FLIGHT_PROVIDER', 'mock'),
    paymentProvider: readString('PAYMENT_PROVIDER', 'mock'),
    holdMinutes: readNumber('BOOKING_HOLD_MINUTES', 15),

    /** Access cookies are `Secure` only when the site is actually served over TLS. */
    cookieSecure: readBoolean('COOKIE_SECURE', isProduction),
    enableMaintenance: readBoolean('ENABLE_MAINTENANCE', true),
  };

  return cached;
}

/** Test helper: forgets the cached parse so a new environment can be read. */
export function resetEnvCache() {
  cached = undefined;
}

export { isProduction };
