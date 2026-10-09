import { PrismaClient, type Prisma } from '@prisma/client';

/**
 * Prisma client singleton.
 *
 * Next.js dev mode and tsx watch both re-evaluate modules on change, which would
 * otherwise open a new connection pool on every reload. The client is cached on
 * `globalThis` outside production so hot reloads reuse one pool.
 */

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export interface PrismaClientOptions {
  /** Log every query and its duration. Defaults to on in development. */
  readonly logQueries?: boolean;
  /** Extra Prisma log events to emit. */
  readonly log?: Prisma.LogLevel[];
}

const QUERY_LOG: Prisma.LogLevel[] = ['query'];

function createPrismaClient(options: PrismaClientOptions = {}): PrismaClient {
  const isProduction = process.env.NODE_ENV === 'production';

  const base: Prisma.LogLevel[] = isProduction ? ['error'] : ['error', 'warn'];
  const queries = options.logQueries === false ? [] : QUERY_LOG;

  return new PrismaClient({
    log: options.log ?? [...base, ...queries],
    errorFormat: isProduction ? 'minimal' : 'pretty',
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Runs `fn` inside a transaction with the isolation level the booking flow needs.
 *
 * Seat selection uses SERIALIZABLE because two concurrent bookings for the same
 * seat must not both read `AVAILABLE` and then both write `HELD`. Serializable
 * isolation makes the second transaction fail with a serialization error, which
 * {@link withSerializableRetry} retries with fresh reads.
 */
export async function withSerializableTransaction<T>(
  client: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { readonly timeoutMs?: number; readonly maxWaitMs?: number } = {},
): Promise<T> {
  return client.$transaction(fn, {
    isolationLevel: 'Serializable',
    timeout: options.timeoutMs ?? 10_000,
    maxWait: options.maxWaitMs ?? 5_000,
  });
}

/** Default isolation transaction, for reads that must be internally consistent. */
export async function withTransaction<T>(
  client: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { readonly timeoutMs?: number; readonly maxWaitMs?: number } = {},
): Promise<T> {
  return client.$transaction(fn, {
    timeout: options.timeoutMs ?? 10_000,
    maxWait: options.maxWaitMs ?? 5_000,
  });
}

export type { Prisma };
export { PrismaClient };
