import { CLIENT_ERROR_CODES, ErrorCode, ERROR_HTTP_STATUS, RETRYABLE_ERROR_CODES } from './error-codes.js';

/**
 * Domain error carrying a stable {@link ErrorCode}. Anything thrown that is a
 * `CorsairError` is considered expected and is surfaced to the client verbatim;
 * everything else is redacted to `INTERNAL_ERROR`.
 */
export class CorsairError extends Error {
  public readonly code: ErrorCode;
  /** HTTP status resolved from the code, unless explicitly overridden. */
  public readonly status: number;
  /** Field-level details, e.g. `{ seatNo: 'already taken' }`. */
  public readonly details?: Record<string, unknown>;
  /** Marks this error as safe to expose to end users. */
  public readonly expose: boolean;

  public constructor(
    code: ErrorCode,
    message: string,
    options: {
      details?: Record<string, unknown>;
      status?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'CorsairError';
    this.code = code;
    this.status = options.status ?? ERROR_HTTP_STATUS[code];
    this.expose = CLIENT_ERROR_CODES.has(code);
    if (options.details !== undefined) {
      this.details = options.details;
    }
    Error.captureStackTrace?.(this, CorsairError);
  }

  public static notFound(entity: string, id: string): CorsairError {
    return new CorsairError(ErrorCode.NOT_FOUND, `${entity} not found: ${id}`, {
      details: { entity, id },
    });
  }

  public static validation(message: string, details?: Record<string, unknown>): CorsairError {
    return new CorsairError(ErrorCode.VALIDATION_FAILED, message, details ? { details } : {});
  }

  public static internal(message: string, cause?: unknown): CorsairError {
    return new CorsairError(ErrorCode.INTERNAL_ERROR, message, cause ? { cause } : {});
  }

  /** True when the operation may be retried without changing the request. */
  public get isRetryable(): boolean {
    return RETRYABLE_ERROR_CODES.has(this.code);
  }
}

/** Narrowing helper that avoids `instanceof` across bundle boundaries. */
export function isCorsairError(value: unknown): value is CorsairError {
  return value instanceof CorsairError;
}
