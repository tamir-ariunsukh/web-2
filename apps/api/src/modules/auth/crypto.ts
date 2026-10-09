import { createHash, randomBytes } from 'node:crypto';

import argon2 from 'argon2';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

import type { UserRole } from '@repo/shared';

/**
 * Password hashing and JWT issuing.
 *
 * Passwords use argon2id with memory-hard parameters. Access and refresh tokens
 * are signed with separate secrets, so a leaked access secret cannot be used to
 * mint refresh tokens.
 */

// argon2id, 19 MiB, 2 iterations, 1 lane — OWASP's minimum recommendation.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed hash is a failed verification, not a crash.
    return false;
  }
}

/** True when a stored hash used weaker parameters and should be rehashed on login. */
export function needsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  } catch {
    return true;
  }
}

export interface AccessTokenClaims {
  readonly sub: string;
  readonly email: string;
  readonly role: UserRole;
}

export interface RefreshTokenClaims {
  readonly sub: string;
  /** Unique per token; rotates on every refresh. */
  readonly jti: string;
  /** Stable across a rotation chain, so replay can revoke the whole family. */
  readonly family: string;
}

const ISSUER = 'airline-booking';
const AUDIENCE = 'airline-booking-api';

export async function signAccessToken(
  claims: AccessTokenClaims,
  secret: string,
  ttl: string,
): Promise<string> {
  return new SignJWT({ email: claims.email, role: claims.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secretKey(secret));
}

export async function signRefreshToken(
  claims: RefreshTokenClaims,
  secret: string,
  ttl: string,
): Promise<string> {
  return new SignJWT({ family: claims.family })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setJti(claims.jti)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secretKey(secret));
}

export interface VerifiedToken<T> {
  readonly claims: T;
  readonly expiresAt: Date;
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<VerifiedToken<AccessTokenClaims>> {
  const payload = await verify(token, secret);
  const { sub, email, role } = payload;

  if (typeof sub !== 'string' || typeof email !== 'string' || typeof role !== 'string') {
    throw new Error('TOKEN_INVALID');
  }

  return {
    claims: { sub, email, role: role as UserRole },
    expiresAt: expiryOf(payload),
  };
}

export async function verifyRefreshToken(
  token: string,
  secret: string,
): Promise<VerifiedToken<RefreshTokenClaims>> {
  const payload = await verify(token, secret);
  const { sub, jti, family } = payload;

  if (typeof sub !== 'string' || typeof jti !== 'string' || typeof family !== 'string') {
    throw new Error('TOKEN_INVALID');
  }

  return {
    claims: { sub, jti, family },
    expiresAt: expiryOf(payload),
  };
}

async function verify(token: string, secret: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secretKey(secret), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return payload;
}

function expiryOf(payload: JWTPayload): Date {
  if (typeof payload.exp !== 'number') {
    throw new Error('TOKEN_INVALID');
  }
  return new Date(payload.exp * 1000);
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

// ─────────────────────────────────────────────────────────────
// Refresh token storage
// ─────────────────────────────────────────────────────────────

/**
 * Refresh tokens are stored as SHA-256 digests. A database leak therefore does
 * not hand an attacker usable tokens, and lookups stay a single index probe.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newTokenFamilyId(): string {
  return randomBytes(16).toString('hex');
}
