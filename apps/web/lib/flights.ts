import 'server-only';

import { getAirports, getFlight, getFlights, type Fare } from './data';
import { apiIsReachable, graphqlRequest } from './graphql-client';
import { localToUtc } from './time';

import type { Airline, FlightRecord } from './types';

/**
 * Flight queries.
 *
 * Prefers the live API so prices, seats and availability come from the database.
 * When the API is unreachable the bundled JSON snapshot is used instead, which
 * keeps the demo browsable without a backend.
 */

export interface FlightSearchResult {
  readonly flights: readonly {
    id: string;
    flightNumber: string;
    /** UTC ISO-8601 instants. */
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
  /** True when the result came from the bundled snapshot rather than the API. */
  readonly fromSnapshot: boolean;
}

export interface FlightFilters {
  readonly airlines?: readonly string[];
  readonly maxPrice?: number;
  readonly minPrice?: number;
  readonly maxDurationMinutes?: number;
  readonly departAfter?: string;
  readonly departBefore?: string;
  readonly refundableOnly?: boolean;
}

export type FlightSort =
  | 'BEST'
  | 'PRICE_ASC'
  | 'PRICE_DESC'
  | 'DURATION_ASC'
  | 'DEPARTURE_ASC';

export interface SearchFlightsParams {
  readonly origin: string;
  readonly destination: string;
  readonly departDate: string;
  readonly returnDate?: string | undefined;
  readonly adults: number;
  readonly children: number;
  readonly infants: number;
  readonly cabin: string;
  readonly filters?: FlightFilters;
  readonly sort?: FlightSort;
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

interface ApiSearchResult {
  readonly searchFlights: Omit<FlightSearchResult, 'fromSnapshot'>;
}

function lowestFare(fares: readonly Fare[], cabin: string): Fare | undefined {
  return fares
    .filter((fare) => fare.fareClass.cabin === cabin)
    .sort((a, b) => a.total - b.total)[0];
}

function fromRecord(flight: FlightRecord, cabin: string): FlightSearchResult['flights'][number] {
  const fare = lowestFare(flight.fares, cabin) ?? lowestFare(flight.fares, 'ECONOMY');

  return {
    id: flight.id,
    flightNumber: flight.flightNumber,
    departureAt: localToUtc(flight.departureAt, flight.origin.timezone),
    arrivalAt: localToUtc(flight.arrivalAt, flight.destination.timezone),
    durationMinutes: flight.durationMinutes,
    status: flight.status,
    airline: flight.airline,
    origin: {
      iataCode: flight.origin.iataCode,
      city: flight.origin.city,
      timezone: flight.origin.timezone,
    },
    destination: {
      iataCode: flight.destination.iataCode,
      city: flight.destination.city,
      timezone: flight.destination.timezone,
    },
    lowestFare:
      fare === undefined
        ? null
        : {
            id: fare.id,
            total: fare.total,
            currency: fare.currency,
            seatsAvailable: fare.seatsAvailable,
            fareClass: fare.fareClass,
          },
  };
}

/** Applies the filter set locally, mirroring the API's semantics. */
function applyFilters(
  flights: FlightSearchResult['flights'],
  filters: FlightFilters | undefined,
): FlightSearchResult['flights'] {
  if (!filters) return flights;

  return flights.filter((flight) => {
    if (filters.airlines && filters.airlines.length > 0) {
      if (!filters.airlines.includes(flight.airline.iataCode)) return false;
    }
    if (
      filters.maxDurationMinutes !== undefined &&
      flight.durationMinutes > filters.maxDurationMinutes
    ) {
      return false;
    }

    const total = flight.lowestFare?.total;
    if (total !== undefined) {
      if (filters.maxPrice !== undefined && total > filters.maxPrice) return false;
      if (filters.minPrice !== undefined && total < filters.minPrice) return false;
    }
    if (filters.refundableOnly && !flight.lowestFare?.fareClass.isRefundable) return false;

    const hour = new Date(flight.departureAt).getUTCHours();
    if (filters.departAfter) {
      const from = Number(filters.departAfter.split(':')[0]);
      if (!Number.isNaN(from) && hour < from) return false;
    }
    if (filters.departBefore) {
      const to = Number(filters.departBefore.split(':')[0]);
      if (!Number.isNaN(to) && hour > to) return false;
    }
    return true;
  });
}

function applySort(
  flights: FlightSearchResult['flights'],
  sort: FlightSort | undefined,
): FlightSearchResult['flights'] {
  const copy = [...flights];
  switch (sort) {
    case 'PRICE_ASC':
      return copy.sort(
        (a, b) => (a.lowestFare?.total ?? Infinity) - (b.lowestFare?.total ?? Infinity),
      );
    case 'PRICE_DESC':
      return copy.sort((a, b) => (b.lowestFare?.total ?? 0) - (a.lowestFare?.total ?? 0));
    case 'DURATION_ASC':
      return copy.sort((a, b) => a.durationMinutes - b.durationMinutes);
    case 'DEPARTURE_ASC':
      return copy.sort((a, b) => a.departureAt.localeCompare(b.departureAt));
    default:
      // BEST: cheapest first, then shortest.
      return copy.sort(
        (a, b) =>
          (a.lowestFare?.total ?? Infinity) - (b.lowestFare?.total ?? Infinity) ||
          a.durationMinutes - b.durationMinutes,
      );
  }
}

/**
 * The API's filter input is not applied to results yet (and rejects 2-letter
 * airline codes), so filters are pushed down only as far as the API supports and
 * then applied here. `airlines` in particular is resolved locally.
 */
export async function searchFlights(params: SearchFlightsParams): Promise<FlightSearchResult> {
  const origin = params.origin.trim().toUpperCase();
  const destination = params.destination.trim().toUpperCase();

  if (await apiIsReachable()) {
    try {
      const data = await graphqlRequest<ApiSearchResult, Record<string, unknown>>(
        SEARCH_QUERY,
        {
          input: {
            origin,
            destination,
            departDate: params.departDate,
            ...(params.returnDate ? { returnDate: params.returnDate } : {}),
            passengers: {
              adults: params.adults,
              children: params.children,
              infants: params.infants,
            },
            cabin: params.cabin,
            sort: params.sort ?? 'BEST',
            limit: 50,
          },
        },
        { revalidate: 30, tags: ['flights'] },
      );

      const mapped = data.searchFlights.flights.map((flight) => ({ ...flight }));
      const filtered = applySort(applyFilters(mapped, params.filters), params.sort);

      return {
        flights: filtered,
        totalCount: filtered.length,
        nextCursor: data.searchFlights.nextCursor,
        fromSnapshot: false,
      };
    } catch {
      // Fall through to the snapshot so a search never hard-fails.
    }
  }

  const matches = getFlights().filter(
    (flight) => flight.origin.iataCode === origin && flight.destination.iataCode === destination,
  );
  const mapped = matches.map((flight) => fromRecord(flight, params.cabin));
  const filtered = applySort(applyFilters(mapped, params.filters), params.sort);

  return {
    flights: filtered,
    totalCount: filtered.length,
    nextCursor: null,
    fromSnapshot: true,
  };
}

/** Every airline that operates, for the filter checkboxes. */
export async function getAirlines(): Promise<readonly Airline[]> {
  if (await apiIsReachable()) {
    try {
      const data = await graphqlRequest<{ airlines: Airline[] }, Record<string, never>>(
        '{ airlines { iataCode name logoUrl } }',
        {},
        { revalidate: 3_600, tags: ['airlines'] },
      );
      if (data.airlines.length > 0) {
        return [...data.airlines]
          .map((airline) => ({ ...airline, flightCount: 0 }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch {
      // Fall through to the snapshot.
    }
  }

  const seen = new Map<string, Airline>();
  for (const flight of getFlights()) {
    const existing = seen.get(flight.airline.iataCode);
    if (existing) {
      seen.set(flight.airline.iataCode, { ...existing, flightCount: existing.flightCount + 1 });
    } else {
      seen.set(flight.airline.iataCode, { ...flight.airline, flightCount: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const FLIGHT_QUERY = /* GraphQL */ `
  query Flight($id: ID!) {
    flight(id: $id) {
      id
      flightNumber
      durationMinutes
      status
      departureAt
      arrivalAt
      airline {
        iataCode
        name
        logoUrl
      }
      origin {
        iataCode
        name
        city
        timezone
      }
      destination {
        iataCode
        name
        city
        timezone
      }
      fares(cabin: ECONOMY) {
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
`;

interface ApiFlightDetail {
  readonly flight: {
    id: string;
    flightNumber: string;
    durationMinutes: number;
    status: string;
    departureAt: string;
    arrivalAt: string;
    airline: { iataCode: string; name: string; logoUrl: string | null };
    origin: { iataCode: string; name: string; city: string; timezone: string };
    destination: { iataCode: string; name: string; city: string; timezone: string };
    fares: readonly {
      id: string;
      total: number;
      currency: string;
      seatsAvailable: number;
      fareClass: { cabin: string; name: string; isRefundable: boolean };
    }[];
  } | null;
}

export interface FlightDetail {
  readonly id: string;
  readonly flightNumber: string;
  readonly durationMinutes: number;
  readonly status: string;
  readonly airline: { iataCode: string; name: string; logoUrl: string | null };
  readonly origin: { iataCode: string; name: string; city: string; timezone: string };
  readonly destination: { iataCode: string; name: string; city: string; timezone: string };
  readonly departureAt: string;
  readonly arrivalAt: string;
  readonly fares: readonly {
    id: string;
    total: number;
    currency: string;
    seatsAvailable: number;
    fareClass: { cabin: string; name: string; isRefundable: boolean };
  }[];
}

/** Full flight detail, used by the booking page and the seat map. */
export async function getFlightDetail(id: string): Promise<FlightDetail | null> {
  if (await apiIsReachable()) {
    try {
      const data = await graphqlRequest<ApiFlightDetail, { id: string }>(
        FLIGHT_QUERY,
        { id },
        { revalidate: 60, tags: ['flights'] },
      );
      return data.flight;
    } catch {
      // Fall through to the snapshot.
    }
  }

  const flight = getFlight(id);
  if (!flight) return null;

  return {
    id: flight.id,
    flightNumber: flight.flightNumber,
    durationMinutes: flight.durationMinutes,
    status: flight.status,
    airline: flight.airline,
    origin: {
      iataCode: flight.origin.iataCode,
      name: flight.origin.name,
      city: flight.origin.city,
      timezone: flight.origin.timezone,
    },
    destination: {
      iataCode: flight.destination.iataCode,
      name: flight.destination.name,
      city: flight.destination.city,
      timezone: flight.destination.timezone,
    },
    departureAt: localToUtc(flight.departureAt, flight.origin.timezone),
    arrivalAt: localToUtc(flight.arrivalAt, flight.destination.timezone),
    fares: flight.fares.map((fare) => ({
      id: fare.id,
      total: fare.total,
      currency: fare.currency,
      seatsAvailable: fare.seatsAvailable,
      fareClass: fare.fareClass,
    })),
  };
}

export interface AirportSuggestion {
  readonly iataCode: string;
  readonly name: string;
  readonly city: string;
  readonly country: string;
}

/** Airport autocomplete. Reference data changes rarely, so it is cached for a day. */
export async function searchAirports(query: string): Promise<readonly AirportSuggestion[]> {
  const needle = query.trim();
  if (needle.length < 2) return [];

  if (await apiIsReachable()) {
    try {
      const data = await graphqlRequest<{ airports: AirportSuggestion[] }, { query: string }>(
        'query Airports($query: String!) { airports(query: $query) { iataCode name city country } }',
        { query: needle },
        { revalidate: 86_400, tags: ['airports'] },
      );
      if (data.airports.length > 0) return data.airports;
    } catch {
      // Fall through to the snapshot.
    }
  }

  const lower = needle.toLowerCase();
  return getAirports()
    .filter((airport) =>
      [airport.iataCode, airport.city, airport.name, airport.country]
        .join(' ')
        .toLowerCase()
        .includes(lower),
    )
    .slice(0, 8)
    .map((airport) => ({
      iataCode: airport.iataCode,
      name: airport.name,
      city: airport.city,
      country: airport.country,
    }));
}

export { getSeatMap } from './seat-map-source';
