import 'server-only';

import { graphqlRequest } from './graphql-client';

/**
 * Flight queries.
 *
 * Responses are cached briefly and tagged so a price change can invalidate them
 * selectively instead of flushing the whole cache.
 */

export interface FlightSearchResult {
  readonly flights: readonly {
    id: string;
    flightNumber: string;
    departureAt: string;
    arrivalAt: string;
    durationMinutes: number;
    status: string;
    airline: { iataCode: string; name: string; logoUrl: string | null };
    origin: { iataCode: string; city: string; timezone: string };
    destination: { iataCode: string; city: string; timezone: string };
    lowestFare: {
      id: string;
      total: number;
      currency: string;
      seatsAvailable: number;
      fareClass: { cabin: string; name: string; isRefundable: boolean };
    } | null;
  }[];
  readonly totalCount: number;
  readonly nextCursor: string | null;
}

const SEARCH_QUERY = /* GraphQL */ `
  query SearchFlights($input: FlightSearchInput!) {
    searchFlights(input: $input) {
      totalCount
      nextCursor
      flights {
        id
        flightNumber
        departureAt
        arrivalAt
        durationMinutes
        status
        airline {
          iataCode
          name
          logoUrl
        }
        origin {
          iataCode
          city
          timezone
        }
        destination {
          iataCode
          city
          timezone
        }
        lowestFare {
          id
          total
          currency
          seatsAvailable
          fareClass {
            cabin
            name
            isRefundable
          }
        }
      }
    }
  }
`;

export interface SearchFlightsParams {
  readonly origin: string;
  readonly destination: string;
  readonly departDate: string;
  readonly returnDate?: string | undefined;
  readonly adults: number;
  readonly children: number;
  readonly infants: number;
  readonly cabin: string;
  readonly limit?: number;
}

export async function searchFlights(params: SearchFlightsParams): Promise<FlightSearchResult> {
  return graphqlRequest<{ searchFlights: FlightSearchResult }, Record<string, unknown>>(
    SEARCH_QUERY,
    {
      input: {
        origin: params.origin,
        destination: params.destination,
        departDate: params.departDate,
        ...(params.returnDate ? { returnDate: params.returnDate } : {}),
        passengers: {
          adults: params.adults,
          children: params.children,
          infants: params.infants,
        },
        cabin: params.cabin,
        limit: params.limit ?? 20,
      },
    },
    // Fares move, so cache for a minute only.
    { revalidate: 60, tags: ['flights'] },
  ).then((data) => data.searchFlights);
}

const AIRPORTS_QUERY = /* GraphQL */ `
  query Airports($query: String!) {
    airports(query: $query) {
      iataCode
      name
      city
      country
    }
  }
`;

export interface AirportSuggestion {
  readonly iataCode: string;
  readonly name: string;
  readonly city: string;
  readonly country: string;
}

/** Airport autocomplete. Reference data changes rarely, so cache it for a day. */
export async function searchAirports(query: string): Promise<readonly AirportSuggestion[]> {
  if (query.trim().length < 2) return [];

  const data = await graphqlRequest<{ airports: AirportSuggestion[] }, { query: string }>(
    AIRPORTS_QUERY,
    { query: query.trim() },
    { revalidate: 86_400, tags: ['airports'] },
  );

  return data.airports;
}
