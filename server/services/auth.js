import { getDatabase } from '../db/connection.js';
import {
  hashPassword,
  hashRefreshToken,
  needsRehash,
  newTokenFamilyId,
  parseTtl,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from '../lib/crypto.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { assertValid, validateLogin, validateRegister } from '../lib/validation.js';

/**
 * Authentication: registration, login, refresh-token rotation and logout.
 *
 * Refresh tokens are stored hashed, so a leaked database cannot be replayed as a
 * session. Rotating on every refresh means a replayed token is detected: the
 * presented row is already revoked, which revokes the whole family.
 */

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;
const MAX_FAILED_DISPLAY = 'Too many failed attempts. Try again later.';

export function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    role: row.role,
    firstName: row.first_name,
    lastName: row.last_name,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    lockedUntil: row.locked_until,
  };
}

function findUserByEmail(email) {
  return getDatabase()
    .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE AND deleted_at IS NULL')
    .get(String(email).toLowerCase());
}

export function findUserById(id) {
  return getDatabase().prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(id);
}

/** Issues an access/refresh pair and records the hashed refresh token. */
function issueSession(user, { familyId, env } = {}) {
  const access = signAccessToken(
    { sub: user.id, email: user.email, role: user.role },
    env.jwtAccessSecret,
    env.jwtAccessTtl,
  );
  const refresh = signRefreshToken(
    { sub: user.id, jti: newId(), family: familyId ?? newTokenFamilyId() },
    env.jwtRefreshSecret,
    env.jwtRefreshTtl,
  );

  const expiresAt = new Date(Date.now() + parseTtl(env.jwtRefreshTtl) * 1_000).toISOString();

  getDatabase()
    .prepare(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(newId(), user.id, hashRefreshToken(refresh.token), expiresAt);

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresIn: access.expiresIn,
    user: mapUser(user),
  };
}

export async function register(input, env) {
  const parsed = assertValid(validateRegister(input));
  if (findUserByEmail(parsed.email)) {
    throw new AppError(
      ErrorCode.EMAIL_ALREADY_REGISTERED,
      'An account with this email already exists',
    );
  }

  const id = newId();
  const passwordHash = await hashPassword(parsed.password);
  getDatabase()
    .prepare(
      `INSERT INTO users (id, email, phone, password_hash, role, first_name, last_name)
       VALUES (?, ?, ?, ?, 'CUSTOMER', ?, ?)`,
    )
    .run(id, parsed.email, parsed.phone ?? null, passwordHash, parsed.firstName, parsed.lastName);

  return issueSession(findUserById(id), { env });
}

export async function login(input, env) {
  const parsed = assertValid(validateLogin(input));
  const user = findUserByEmail(parsed.email);

  // The same message for an unknown email and a wrong password: distinguishing
  // them would turn the login form into an account-enumeration oracle.
  if (!user) {
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect');
  }

  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
    throw new AppError(ErrorCode.ACCOUNT_LOCKED, MAX_FAILED_DISPLAY);
  }

  const valid = await verifyPassword(user.password_hash, parsed.password);
  if (!valid) {
    const failedCount = user.failed_login_count + 1;
    const shouldLock = failedCount >= LOCKOUT_THRESHOLD;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString()
      : null;

    getDatabase()
      .prepare(
        `UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      // A lockout resets the counter: otherwise the next single failure on an
      // already-locked account would extend the lock indefinitely.
      .run(shouldLock ? 0 : failedCount, lockedUntil, user.id);

    if (shouldLock) throw new AppError(ErrorCode.ACCOUNT_LOCKED, MAX_FAILED_DISPLAY);
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect');
  }

  if (needsRehash(user.password_hash)) {
    const passwordHash = await hashPassword(parsed.password);
    getDatabase().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
  }

  getDatabase()
    .prepare(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL,
              last_login_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(user.id);

  return issueSession(findUserById(user.id), { env });
}

export function refreshSession(token, env) {
  let claims;
  try {
    claims = verifyRefreshToken(token, env.jwtRefreshSecret).claims;
  } catch {
    throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Your session has expired. Please sign in again.');
  }

  const stored = getDatabase()
    .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
    .get(hashRefreshToken(token));

  if (!stored || stored.user_id !== claims.sub) {
    throw new AppError(ErrorCode.TOKEN_REVOKED, 'This session is no longer valid');
  }

  if (stored.revoked_at) {
    // Reuse of an already-rotated token means it leaked, so every session for
    // the account is revoked rather than just the presented one.
    getDatabase()
      .prepare(
        "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL",
      )
      .run(stored.user_id);
    throw new AppError(ErrorCode.TOKEN_REVOKED, 'This session is no longer valid');
  }

  if (Date.parse(stored.expires_at) < Date.now()) {
    throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Your session has expired. Please sign in again.');
  }

  const user = findUserById(stored.user_id);
  if (!user) throw new AppError(ErrorCode.TOKEN_REVOKED, 'This session is no longer valid');

  const session = issueSession(user, { familyId: claims.family, env });

  getDatabase()
    .prepare(
      "UPDATE refresh_tokens SET revoked_at = datetime('now'), last_used_at = datetime('now') WHERE id = ?",
    )
    .run(stored.id);

  return session;
}

export function logout(token) {
  if (!token) return;
  getDatabase()
    .prepare(
      "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL",
    )
    .run(hashRefreshToken(token));
}

export { hashPassword };
