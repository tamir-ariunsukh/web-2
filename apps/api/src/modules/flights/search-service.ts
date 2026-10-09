import { CorsairError, ErrorCode, type FlightSearchInput } from '@repo/shared';

import { ProviderRegistry } from './provider-registry.js';

import type { GraphQLContext } from '../context.js';
import type { ProviderItinerary, ProviderSearchParams } from './provider.js';

/**
 * Flight search.
 *
 * Normalises a validated search input into a provider request, then re-reads the
 * matched flights from the database so the response carries full relational data
 * (airline, airports, fares) that GraphQL fields can resolve through DataLoader.
 */

const registryCache = new WeakMap<GraphQLContext, ProviderRegistry>();

function registryFor(context: GraphQLContext): ProviderRegistry {
  const cached = registryCache.get(context);
  if (cached) return cached;

  // The registry is stateless apart from the provider map, so one per context
  // avoids rebuilding adapters on every resolver call within a request.
  const registry = new ProviderRegistry(context.prisma, context.env, context.logger);
  registryCache.set(context, registry);
  return registry;
}

/** Encodes the keyset position for the next page. */
function encodeCursor(departureAt: Date, id: string): string {
  return Buffer.from(`${departureAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { departureAt: Date; id: string } | undefined {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separator = decoded.lastIndexOf('|');
    if (separator < 0) return undefined;

    const departureAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (Number.isNaN(departureAt.getTime()) || id.length === 0) return undefined;

    return { departureAt, id };
  } catch {
    return undefined;
  }
}

export interface FlightSearchResultPayload {
  readonly flights: Awaited<ReturnType<GraphQLContext['prisma']['flight']['findMany']>>;
  readonly totalCount: number;
  readonly nextCursor: string | null;
  readonly priceFrom: number | null;
  readonly currency: string;
}

export async function searchFlights(
  context: GraphQLContext,
  input: FlightSearchInput,
): Promise<FlightSearchResultPayload> {
  const params: ProviderSearchParams = {
    origin: input.origin,
    destination: input.destination,
    departDate: input.departDate,
    ...(input.returnDate ? { returnDate: input.returnDate } : {}),
    passengers: {
      adults: input.passengers.adults,
      children: input.passengers.children,
      infants: input.passengers.infants,
    },
    cabin: input.cabin,
    // Over-fetch so post-filtering by price and stops still fills a page.
    limit: input.limit * 2,
  };

  const registry = registryFor(context);
  const outcome = await registry.search(params);

  if (outcome.itineraries.length === 0) {
    return { flights: [], totalCount: 0, nextCursor: null, priceFrom: null, currency: 'USD' };
  }

  const flightIds = extractFlightIds(outcome.itineraries);
  const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;

  const flights = await context.prisma.flight.findMany({
    where: {
      id: { in: flightIds },
      ...(cursor
        ? {
            OR: [
              { departureAt: { gt: cursor.departureAt } },
              { departureAt: cursor.departureAt, id: { gt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ departureAt: 'asc' }, { id: 'asc' }],
    take: input.limit + 1,
    include: {
      fares: {
        select: { id: true, basePrice: true, taxes: true, fees: true, currency: true },
      },
    },
  });
  const hasMore = flights.length > input.limit;
  const page = hasMore ? flights.slice(0, input.limit) : flights;
  const last = page.at(-1);

  if (outcome.degraded) {
    context.logger.warn(
      { origin: input.origin, destination: input.destination, servedBy: outcome.servedBy },
      'flight search served from fallback provider',
    );
  }

  if (page.length === 0 && input.cursor) {
    throw new CorsairError(ErrorCode.NO_FLIGHTS_FOUND, 'No more flights match this search');
  }

  // `priceFrom` labels the "from" price on the results header; it is the cheapest
  // total across the page, computed from the fares the provider returned.
  const cheapest = outcome.itineraries
    .flatMap((itinerary) => itinerary.fares)
    .reduce<number | null>((lowest, fare) => {
      const total = fare.basePrice + fare.taxes + fare.fees;
      return lowest === null || total < lowest ? total : lowest;
    }, null);

  return {
    // The full row is returned so GraphQL field resolvers can read it directly;
    // relations still resolve through DataLoader to avoid N+1 queries.
    flights: page,
    totalCount: page.length,
    nextCursor: hasMore && last ? encodeCursor(last.departureAt, last.id) : null,
    priceFrom: cheapest,
    currency: page[0]?.fares.length ? 'USD' : (outcome.itineraries[0]?.fares[0]?.currency ?? 'USD'),
  };
}

/**
 * Recovers flight ids from provider itinerary ids.
 *
 * Adapters prefix their own name, so the id is taken from the final segment.
 * Live adapters that do not persist flights return ids that are absent from the
 * local table; those itineraries are dropped by the `id: { in: ... }` filter.
 */
function extractFlightIds(itineraries: readonly ProviderItinerary[]): string[] {
  const ids = new Set<string>();
  for (const itinerary of itineraries) {
    const separator = itinerary.providerId.indexOf(':');
    if (separator < 0) continue;
    const id = itinerary.providerId.slice(separator + 1);
    if (id.length > 0) ids.add(id);
  }
  return [...ids];
}
