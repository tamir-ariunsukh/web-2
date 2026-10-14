import { loadEnv } from '../env.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { mapUser } from '../services/auth.js';

/**
 * Request authentication.
 *
 * The access token arrives either as a cookie (browser session) or as a bearer
 * header (scripted client), so both are accepted. A malformed or expired token is
 * treated as anonymous rather than an error: a stale cookie in a browser tab must
 * not break a public page.
 */

export const ACCESS_COOKIE = 'at';
export const REFRESH_COOKIE = 'rt';

const ACCESS_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_MAX_AGE_SECONDS = 30 * 86_400;

export function resolveUser(req, context) {
  const header = req.headers.authorization;
  let token;

  if (header?.startsWith('Bearer ')) {
    token = header.slice('Bearer '.length).trim();
  } else {
    token = context.cookies[ACCESS_COOKIE];
  }

  if (!token) return undefined;

  try {
    const { claims } = context.verifyAccessToken(token, loadEnv().jwtAccessSecret);
    return { id: claims.sub, email: claims.email, role: claims.role };
  } catch {
    return undefined;
  }
}

/**
 * Verifies the caller from a refresh cookie and returns the new session.
 *
 * Rotation happens on every refresh, so the presented token is invalidated by the
 * act of using it.
 */
export function refreshFromCookie(context) {
  const token = context.cookies[REFRESH_COOKIE];
  if (!token) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, 'You must be signed in');
  }
  return context.services.auth.refreshSession(token, loadEnv());
}

export function userView(row) {
  const user = mapUser(row);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
  };
}
