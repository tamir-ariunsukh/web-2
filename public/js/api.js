/**
 * API client.
 *
 * Every call goes to the same origin, so the httpOnly session cookie travels
 * automatically and no token ever has to be kept in JavaScript-accessible
 * storage. Responses are normalised to `{ ok, data, error }` so callers branch on
 * `error.code` rather than parsing messages.
 */

export class ApiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

async function request(method, path, body, { retried = false } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('NETWORK', 'Could not reach the server. Is it running?');
  }

  // An expired access token is the common case after 15 minutes of reading, so it
  // is renewed once and the original request replayed rather than surfaced as an
  // error the user has to act on.
  if (response.status === 401 && !retried && !path.startsWith('/api/auth/')) {
    if (await renewSession()) {
      return request(method, path, body, { retried: true });
    }
  }

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new ApiError(
      error.code ?? (response.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL_ERROR'),
      error.message ?? `Request failed with ${response.status}`,
      error.details,
    );
  }

  return payload ?? {};
}

/**
 * Exchanges the refresh cookie for a new access cookie.
 *
 * Only one renewal runs at a time: a page that fires several requests in parallel
 * when the token lapses would otherwise start a refresh per request and, because
 * the server rotates the token on every use, all but the first would be rejected
 * as reuse.
 */
let renewing = null;

function renewSession() {
  if (!renewing) {
    renewing = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        renewing = null;
      });
  }
  return renewing;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  delete: (path) => request('DELETE', path),
};

/** Builds a query string, omitting empty values so URLs stay clean. */
export function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const result = search.toString();
  return result === '' ? '' : `?${result}`;
}
