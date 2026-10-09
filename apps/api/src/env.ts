import { z } from 'zod';

/**
 * Environment contract. Parsed once at boot so a misconfigured deployment fails
 * immediately instead of at the first request that touches a missing variable.
 */

/**
 * Boolean environment variables arrive as strings, where `"false"` is truthy to
 * `Boolean()`. This parses the common textual forms instead of coercing.
 */
const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  });

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url().startsWith('postgres'),
  REDIS_URL: z.string().url().startsWith('redis'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  /** 32-byte key, hex encoded. Encrypts PII at rest. */
  PII_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'PII_ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),

  FLIGHT_PROVIDER: z.enum(['mock', 'duffel', 'amadeus']).default('mock'),
  DUFFEL_API_TOKEN: z.string().optional(),
  AMADEUS_CLIENT_ID: z.string().optional(),
  AMADEUS_CLIENT_SECRET: z.string().optional(),
  PROVIDER_FALLBACK_TO_MOCK: booleanFromString.default(true),

  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  BOOKING_HOLD_MINUTES: z.coerce.number().int().min(1).max(120).default(15),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),

  /** Comma-separated browser origins allowed by CORS. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),

  /** Reject GraphQL operations deeper than this to blunt abusive queries. */
  GRAPHQL_MAX_DEPTH: z.coerce.number().int().min(1).max(30).default(10),
  /** Set to false in production so the schema is not publicly enumerable. */
  GRAPHQL_INTROSPECTION: booleanFromString.default(true),
});

const schema = baseSchema.superRefine((value, ctx) => {
  if (value.FLIGHT_PROVIDER === 'duffel' && !value.DUFFEL_API_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DUFFEL_API_TOKEN'],
      message: 'Required when FLIGHT_PROVIDER=duffel',
    });
  }

  if (
    value.FLIGHT_PROVIDER === 'amadeus' &&
    (!value.AMADEUS_CLIENT_ID || !value.AMADEUS_CLIENT_SECRET)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AMADEUS_CLIENT_ID'],
      message: 'AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET are required when FLIGHT_PROVIDER=amadeus',
    });
  }

  // Production must not ship development secrets.
  if (value.NODE_ENV === 'production') {
    const weak = ['dev-only', 'change-me', '0000000000'];
    const secrets: [string, string][] = [
      ['JWT_ACCESS_SECRET', value.JWT_ACCESS_SECRET],
      ['JWT_REFRESH_SECRET', value.JWT_REFRESH_SECRET],
      ['PAYMENT_WEBHOOK_SECRET', value.PAYMENT_WEBHOOK_SECRET],
    ];
    for (const [key, secret] of secrets) {
      if (weak.some((token) => secret.includes(token))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} still contains a development placeholder in production`,
        });
      }
    }
  }
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parses and caches `process.env`. Throws a readable aggregate on failure. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;

  const result = schema.safeParse(source);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  cached = result.data;
  return cached;
}

/** Test helper: clears the memoised env so a spec can reload with new values. */
export function resetEnvCache(): void {
  cached = undefined;
}
