
import type { Env } from '../env.js';
import type { Loaders } from './loaders.js';
import type { PrismaClient } from '@repo/db';
import type { UserRole } from '@repo/shared';
import type { Logger } from 'pino';

/**
 * Per-request state handed to every resolver. Built once in the Express layer
 * and passed through Apollo's `context` function.
 */

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
}

export interface GraphQLContext {
  readonly prisma: PrismaClient;
  readonly logger: Logger;
  /** Parsed environment, so services can read provider and policy settings. */
  readonly env: Env;
  /** Correlation id, echoed in the `x-request-id` response header. */
  readonly requestId: string;
  /** `undefined` for anonymous requests. */
  readonly user: AuthUser | undefined;
  /** Per-request batch loaders, created lazily on first use. */
  readonly loaders: Loaders;
  /** True when running under the test runner, which relaxes some guards. */
  readonly isTest: boolean;
}

/** Narrows the context to require an authenticated user. */
export function requireUser(context: GraphQLContext): AuthUser {
  if (!context.user) {
    throw new Error('UNAUTHENTICATED');
  }
  return context.user;
}

/** Narrows the context to require one of the given roles. */
export function requireRole(
  context: GraphQLContext,
  ...roles: readonly UserRole[]
): AuthUser {
  const user = requireUser(context);
  if (!roles.includes(user.role)) {
    throw new Error('FORBIDDEN');
  }
  return user;
}

export function isPrivileged(context: GraphQLContext): boolean {
  return context.user?.role === 'ADMIN' || context.user?.role === 'AGENT';
}
