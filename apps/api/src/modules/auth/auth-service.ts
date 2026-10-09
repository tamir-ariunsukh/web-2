import { CorsairError, ErrorCode, type LoginInput, type RegisterInput } from '@repo/shared';

import {
  hashPassword,
  hashRefreshToken,
  needsRehash,
  newTokenFamilyId,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from './crypto.js';

import type { GraphQLContext } from '../context.js';

/**
 * Authentication.
 *
 * Refresh tokens rotate on every use: the presented token is revoked and replaced,
 * and a token that is presented twice is treated as theft — the whole family is
 * revoked, forcing a fresh login.
 */

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

export interface AuthPayloadResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    role: string;
    createdAt: Date;
  };
}

export async function register(
  context: GraphQLContext,
  input: RegisterInput,
): Promise<AuthPayloadResult> {
  const { prisma, logger } = context;

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw new CorsairError(
      ErrorCode.EMAIL_ALREADY_REGISTERED,
      'An account with this email already exists',
    );
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      role: 'CUSTOMER',
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  logger.info({ userId: user.id }, 'user registered');

  return issueSession(context, user, { familyId: newTokenFamilyId() });
}

export async function login(
  context: GraphQLContext,
  input: LoginInput,
): Promise<AuthPayloadResult> {
  const { prisma, logger } = context;

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      createdAt: true,
      passwordHash: true,
      failedLoginCount: true,
      lockedUntil: true,
      deletedAt: true,
    },
  });

  // Identical error for unknown account and wrong password, so the endpoint
  // cannot be used to enumerate registered emails.
  if (!user || user.deletedAt) {
    throw new CorsairError(ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect');
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new CorsairError(
      ErrorCode.ACCOUNT_LOCKED,
      'Too many failed attempts. Try again later.',
    );
  }

  const valid = await verifyPassword(user.passwordHash, input.password);

  if (!valid) {
    const failedCount = user.failedLoginCount + 1;
    const shouldLock = failedCount >= LOCKOUT_THRESHOLD;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failedCount,
        ...(shouldLock
          ? { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000), failedLoginCount: 0 }
          : {}),
      },
    });

    logger.warn({ userId: user.id, failedCount }, 'failed login attempt');
    throw new CorsairError(ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect');
  }

  // Opportunistically upgrade hashes created with weaker parameters.
  if (needsRehash(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password) },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const { passwordHash: _hash, failedLoginCount: _count, lockedUntil: _lock, deletedAt: _deleted, ...safe } = user;
  void _hash;
  void _count;
  void _lock;
  void _deleted;

  logger.info({ userId: user.id }, 'user logged in');

  return issueSession(context, safe, { familyId: newTokenFamilyId() });
}

/**
 * Exchanges a refresh token for a new session.
 *
 * Rotation plus reuse detection: presenting a token that was already rotated away
 * means either a replay or a stolen token, so the entire family is revoked.
 */
export async function refreshSession(
  context: GraphQLContext,
  token: string,
): Promise<AuthPayloadResult> {
  const { prisma, env, logger } = context;

  let claims: { sub: string; jti: string };
  try {
    const verified = await verifyRefreshToken(token, env.JWT_REFRESH_SECRET);
    claims = verified.claims;
  } catch {
    throw new CorsairError(ErrorCode.TOKEN_EXPIRED, 'Refresh token is invalid or expired');
  }

  const tokenHash = hashRefreshToken(token);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, revokedAt: true, expiresAt: true, replacedById: true },
  });

  if (stored?.userId !== claims.sub) {
    throw new CorsairError(ErrorCode.TOKEN_REVOKED, 'Refresh token is not recognised');
  }

  if (stored.revokedAt) {
    // Reuse of a rotated token: revoke every active token for this user.
    logger.error(
      { userId: stored.userId, tokenId: stored.id },
      'refresh token reuse detected, revoking all sessions',
    );

    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    throw new CorsairError(ErrorCode.TOKEN_REVOKED, 'Refresh token was already used');
  }

  if (stored.expiresAt.getTime() < Date.now()) {
    throw new CorsairError(ErrorCode.TOKEN_EXPIRED, 'Refresh token has expired');
  }

  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new CorsairError(ErrorCode.TOKEN_REVOKED, 'Account no longer exists');
  }

  const payload = await issueSession(context, user, { familyId: claims.jti });

  // Revoke the presented token only after the replacement is persisted, so a
  // crash between the two steps cannot lock the customer out.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date(), lastUsedAt: new Date() },
  });

  return payload;
}

export async function logout(context: GraphQLContext, token: string): Promise<void> {
  const { prisma } = context;
  const tokenHash = hashRefreshToken(token);

  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly role: string;
  readonly createdAt: Date;
}

/** Issues an access token and a stored refresh token. */
async function issueSession(
  context: GraphQLContext,
  user: SessionUser,
  options: { readonly familyId: string },
): Promise<AuthPayloadResult> {
  const { prisma, env } = context;

  const accessToken = await signAccessToken(
    { sub: user.id, email: user.email, role: user.role as never },
    env.JWT_ACCESS_SECRET,
    env.JWT_ACCESS_TTL,
  );

  const refreshToken = await signRefreshToken(
    { sub: user.id, jti: options.familyId },
    env.JWT_REFRESH_SECRET,
    env.JWT_REFRESH_TTL,
  );

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + parseTtl(env.JWT_REFRESH_TTL) * 1000),
    },
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: parseTtl(env.JWT_ACCESS_TTL),
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
    },
  };
}

/** Parses a duration such as `15m`, `30d` or `3600s` into seconds. */
export function parseTtl(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) {
    throw new Error(`Unsupported TTL format: ${ttl}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };
  const multiplier = unit ? multipliers[unit] : undefined;
  if (multiplier === undefined) {
    throw new Error(`Unsupported TTL unit: ${ttl}`);
  }

  return amount * multiplier;
}
