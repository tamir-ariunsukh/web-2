/**
 * Vitest global setup.
 *
 * Supplies deterministic defaults for the variables {@link loadEnv} requires, so
 * unit tests never depend on a developer's local `.env`. Individual specs that
 * exercise configuration parsing call `loadEnv()` with an explicit object.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
process.env.PII_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.PAYMENT_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.S3_ENDPOINT = 'http://localhost:9000';
process.env.S3_BUCKET = 'tickets';
process.env.S3_ACCESS_KEY = 'minioadmin';
process.env.S3_SECRET_KEY = 'minioadmin';
