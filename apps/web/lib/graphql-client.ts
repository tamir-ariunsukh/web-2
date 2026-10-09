import 'server-only';

/**
 * Typed GraphQL client for the API.
 *
 * Server-only so the access token can be attached from an httpOnly cookie without
 * ever reaching the browser bundle.
 */

export interface GraphQLRequestOptions {
  /** Bearer token for authenticated operations. */
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
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
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
