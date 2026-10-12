import 'server-only';

import { cookies } from 'next/headers';

/**
 * Typed GraphQL client for the API.
 *
 * Server-only so the access token can be attached from an httpOnly cookie without
 * ever reaching the browser bundle.
 */

export const ACCESS_COOKIE = 'at';
export const REFRESH_COOKIE = 'rt';

export interface GraphQLRequestOptions {
  /** Overrides the token from the cookie jar. */
  readonly token?: string | undefined;
  /** Tags for Next.js fetch caching. */
  readonly tags?: readonly string[];
  /** Seconds until the response is considered stale. */
  readonly revalidate?: number;
}

export interface GraphQLResponse<T> {
  readonly data?: T;
  readonly errors?: readonly {
    message: string;
    path?: readonly (string | number)[];
    extensions?: { code?: string; details?: unknown };
  }[];
}

/** Thrown when the API returns GraphQL errors. Carries the first error's code. */
export class GraphQLClientError extends Error {
  public readonly code: string;
  public readonly details: unknown;

  public constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'GraphQLClientError';
    this.code = code;
    this.details = details;
  }
}

function endpoint(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured');
  }
  return url;
}

/** Reads the access token from the request cookies, if present. */
export async function cookieToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value;
}

/**
 * Executes a GraphQL operation.
 *
 * `cache: 'no-store'` is the default for mutations and user-specific reads; pass
 * `revalidate` or `tags` for data that is safe to cache, such as the airline list.
 */
export async function graphqlRequest<TData, TVariables extends Record<string, unknown>>(
  query: string,
  variables: TVariables,
  options: GraphQLRequestOptions = {},
): Promise<TData> {
  const token = options.token ?? (await cookieToken());

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const cacheOptions: RequestInit =
    options.revalidate === undefined && options.tags === undefined
      ? { cache: 'no-store' }
      : {
          next: {
            ...(options.revalidate === undefined ? {} : { revalidate: options.revalidate }),
            ...(options.tags ? { tags: [...options.tags] } : {}),
          },
        };

  const response = await fetch(endpoint(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
    ...cacheOptions,
  });

  if (!response.ok) {
    throw new GraphQLClientError(
      `API responded with ${response.status}`,
      response.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL_ERROR',
    );
  }

  const payload = (await response.json()) as GraphQLResponse<TData>;
  const firstError = payload.errors?.[0];

  if (firstError) {
    throw new GraphQLClientError(
      firstError.message,
      firstError.extensions?.code ?? 'INTERNAL_ERROR',
      firstError.extensions?.details,
    );
  }

  if (!payload.data) {
    throw new GraphQLClientError('API returned no data', 'INTERNAL_ERROR');
  }

  return payload.data;
}

/**
 * True when the API is reachable, cached briefly.
 *
 * Every page would otherwise pay for a probe request in addition to its query.
 * A short TTL keeps that cost negligible while still noticing an API that went
 * down (or came back) within a few seconds.
 */
let reachability: { at: number; value: boolean } | undefined;
const REACHABILITY_TTL_MS = 3_000;

export async function apiIsReachable(): Promise<boolean> {
  const now = Date.now();
  if (reachability && now - reachability.at < REACHABILITY_TTL_MS) {
    return reachability.value;
  }

  let value = false;
  try {
    const response = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
      cache: 'no-store',
    });
    value = response.ok;
  } catch {
    value = false;
  }

  reachability = { at: now, value };
  return value;
}
