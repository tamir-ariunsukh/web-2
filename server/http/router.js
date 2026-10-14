import { AppError, ErrorCode, ERROR_HTTP_STATUS, isAppError } from '../lib/errors.js';

/**
 * A minimal HTTP layer.
 *
 * The original build used Express with Apollo Server, helmet, cors and pino-http.
 * All four are small enough to replace directly: routing is a sorted list of
 * `{ method, pattern, handler }` entries, and the middleware chain is an
 * explicit array of functions in `server/index.js`.
 */

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler, options = {}) {
    this.routes.push({
      method,
      pattern,
      segments: pattern.split('/').filter(Boolean),
      handler,
      options,
    });
    return this;
  }

  get(pattern, handler, options) {
    return this.add('GET', pattern, handler, options);
  }

  post(pattern, handler, options) {
    return this.add('POST', pattern, handler, options);
  }

  patch(pattern, handler, options) {
    return this.add('PATCH', pattern, handler, options);
  }

  put(pattern, handler, options) {
    return this.add('PUT', pattern, handler, options);
  }

  delete(pattern, handler, options) {
    return this.add('DELETE', pattern, handler, options);
  }

  /** Finds the first route matching the method and path, with its params. */
  match(method, pathname) {
    const requested = pathname.split('/').filter(Boolean);

    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== requested.length) continue;

      const params = {};
      let matched = true;
      for (let index = 0; index < route.segments.length; index += 1) {
        const segment = route.segments[index];
        if (segment.startsWith(':')) {
          params[segment.slice(1)] = decodeURIComponent(requested[index]);
        } else if (segment !== requested[index]) {
          matched = false;
          break;
        }
      }

      if (matched) return { route, params };
    }
    return null;
  }
}

/** Reads and parses a JSON body, bounded so a large upload cannot exhaust memory. */
export async function readJsonBody(req, { limitBytes = 256 * 1024 } = {}) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Request body is too large', { status: 413 });
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(ErrorCode.VALIDATION_FAILED, 'Request body is not valid JSON');
  }
}

/**
 * Parses a cookie header into an object.
 *
 * Only the pairs needed are read, so a malformed trailing cookie does not
 * invalidate the ones before it.
 */
export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;

  for (const part of String(header).split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

/**
 * Builds a `Set-Cookie` value.
 *
 * `httpOnly` keeps the access token out of reach of injected script, and
 * `sameSite=lax` allows the cookie on top-level navigations while blocking it on
 * cross-site form posts, which is the CSRF shape that matters here.
 */
export function serialiseCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`);
  if (options.secure) parts.push('Secure');
  if (options.expires) parts.push(`Expires=${options.expires}`);

  return parts.join('; ');
}

/** Appends a `Set-Cookie` without clobbering one already set on this response. */
export function appendCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) res.setHeader('Set-Cookie', [cookie]);
  else res.setHeader('Set-Cookie', [...existing, cookie]);
}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function sendError(res, error, { logger, isProduction } = {}) {
  if (isAppError(error)) {
    sendJson(res, error.status ?? ERROR_HTTP_STATUS[error.code] ?? 500, {
      error: {
        code: error.code,
        message: error.message,
        ...(error.expose && error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  logger?.error(error);
  sendJson(res, 500, {
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: isProduction ? 'Internal server error' : String(error?.message ?? error),
    },
  });
}

export function notFound(res) {
  sendJson(res, 404, { error: { code: ErrorCode.NOT_FOUND, message: 'Route not found' } });
}

/**
 * Wraps a handler so a thrown `AppError` becomes the right status and every other
 * error is logged and redacted.
 */
export function handler(fn, { logger, isProduction } = {}) {
  return async (req, res, context) => {
    try {
      await fn(req, res, context);
    } catch (error) {
      if (!res.headersSent) {
        sendError(res, error, { logger, isProduction });
      } else {
        logger?.error(error);
        res.end();
      }
    }
  };
}
