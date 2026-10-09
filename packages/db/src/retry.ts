/**
 * Serializable transactions can fail by design when two bookings race for the
 * same seat. Prisma surfaces this as P2034, and the correct response is to retry
 * the whole transaction with fresh reads.
 */
export class SerializationConflictError extends Error {
  public readonly code = 'SERIALIZATION_CONFLICT';

  public constructor(message = 'Transaction conflicted with a concurrent write', options: ErrorOptions = {}) {
    super(message, options);
    this.name = 'SerializationConflictError';
  }
}

export function isSerializationFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; meta?: unknown };
  // P2034: transaction failed due to a write conflict or deadlock.
  return candidate.code === 'P2034';
}

export interface RetryOptions {
  readonly attempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * Retries `fn` when it fails with a serialization conflict, using exponential
 * backoff with full jitter so contending transactions do not stay in lockstep.
 */
export async function withSerializableRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 25;
  const maxDelayMs = options.maxDelayMs ?? 400;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isSerializationFailure(error)) {
        throw error;
      }

      lastError = error;
      options.onRetry?.(attempt, error);

      if (attempt === attempts) break;

      const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = Math.random() * ceiling;
      await sleep(delay);
    }
  }

  throw new SerializationConflictError(
    `Transaction failed after ${attempts} attempts due to concurrent writes`,
    { cause: lastError },
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
