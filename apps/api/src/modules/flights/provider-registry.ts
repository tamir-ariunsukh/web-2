

import { MockProvider } from './mock-provider.js';
import { ProviderError, type FlightProvider, type ProviderSearchParams, type ProviderItinerary } from './provider.js';

import type { Env } from '../../env.js';
import type { PrismaClient } from '@repo/db';
import type { Logger } from 'pino';

/**
 * Provider selection and resilience.
 *
 * The registry picks the configured provider at boot. If that provider fails
 * during a search and `PROVIDER_FALLBACK_TO_MOCK` is set, the request is retried
 * against the local catalogue so a supplier outage degrades the result set
 * instead of failing the search.
 */

export interface SearchOutcome {
  readonly itineraries: readonly ProviderItinerary[];
  /** Which provider actually answered, for the response metadata and logs. */
  readonly servedBy: string;
  readonly degraded: boolean;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, FlightProvider>();
  private readonly mock: MockProvider;

  public constructor(
    prisma: PrismaClient,
    private readonly env: Env,
    private readonly logger: Logger,
  ) {
    this.mock = new MockProvider(prisma);
    this.providers.set('mock', this.mock);
  }

  /** The provider named by configuration. */
  public primary(): FlightProvider {
    const provider = this.providers.get(this.env.FLIGHT_PROVIDER);
    if (!provider) {
      this.logger.warn(
        { configured: this.env.FLIGHT_PROVIDER },
        'configured flight provider is not registered, using mock',
      );
      return this.mock;
    }
    return provider;
  }

  /**
   * Searches through the primary provider, falling back to the local catalogue
   * when the supplier is unreachable and fallback is enabled.
   */
  public async search(params: ProviderSearchParams): Promise<SearchOutcome> {
    const primary = this.primary();

    if (primary.name === 'mock') {
      return { itineraries: await primary.search(params), servedBy: 'mock', degraded: false };
    }

    try {
      const itineraries = await primary.search(params);
      return { itineraries, servedBy: primary.name, degraded: false };
    } catch (error) {
      const retryable = error instanceof ProviderError && error.retryable;

      if (!retryable || !this.env.PROVIDER_FALLBACK_TO_MOCK) {
        throw error;
      }

      this.logger.warn(
        { err: error, provider: primary.name },
        'primary provider failed, falling back to mock catalogue',
      );

      return {
        itineraries: await this.mock.search(params),
        servedBy: 'mock',
        degraded: true,
      };
    }
  }

  /** Resolves the provider that owns an itinerary, based on its id prefix. */
  public forItinerary(providerId: string): FlightProvider {
    const name = providerId.split(':', 1)[0] ?? 'mock';
    return this.providers.get(name) ?? this.mock;
  }

  public mockProvider(): MockProvider {
    return this.mock;
  }

  /** Probes every registered provider; used by the readiness endpoint. */
  public async health(): Promise<Record<string, boolean>> {
    const entries = await Promise.all(
      [...this.providers.entries()].map(async ([name, provider]) => {
        try {
          return [name, await provider.healthCheck()] as const;
        } catch {
          return [name, false] as const;
        }
      }),
    );
    return Object.fromEntries(entries);
  }
}
