/**
 * Demo data types and constants.
 *
 * Kept free of Node built-ins and `server-only` so both server and client
 * components can import it. The JSON snapshot is read in `lib/data.ts`.
 */

export interface Airport {
  readonly iataCode: string;
  readonly name: string;
  readonly city: string;
  readonly country: string;
  readonly timezone: string;
}

export interface Airline {
  readonly iataCode: string;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly flightCount: number;
}

export interface FareClassInfo {
  readonly cabin: string;
  readonly name: string;
  readonly isRefundable: boolean;
}

export interface Fare {
  readonly id: string;
  readonly total: number;
  readonly currency: string;
  readonly seatsAvailable: number;
  readonly fareClass: FareClassInfo;
}

export interface FlightEndpoint {
  readonly iataCode: string;
  readonly name: string;
  readonly city: string;
  readonly country: string;
  readonly timezone: string;
}

export interface FlightRecord {
  readonly id: string;
  readonly flightNumber: string;
  /** Local wall-clock time at the origin, `YYYY-MM-DDTHH:mm:ss`. */
  readonly departureAt: string;
  /** Local wall-clock time at the destination, `YYYY-MM-DDTHH:mm:ss`. */
  readonly arrivalAt: string;
  readonly durationMinutes: number;
  readonly status: string;
  readonly airline: { iataCode: string; name: string; logoUrl: string | null };
  readonly origin: FlightEndpoint;
  readonly destination: FlightEndpoint;
  readonly fares: readonly Fare[];
}

export interface SeatMapCabinSummary {
  readonly cabin: string;
  readonly totalSeats: number;
  readonly available: number;
  readonly held: number;
  readonly booked: number;
  readonly blocked: number;
}

export interface SeatMapRecord {
  readonly flightId: string;
  readonly aircraftModel: string;
  readonly configuration: string;
  readonly cabins: readonly SeatMapCabinSummary[];
}

/**
 * Static seat layout per cabin.
 *
 * The snapshot stores one summary row per flight, but a seat map needs every
 * individual seat. The grid is derived from the cabin class instead of exported,
 * which keeps the bundle small while still producing a realistic, stable map.
 *
 * `surcharge` is in minor currency units, matching how fares are stored.
 */
export const CABIN_LAYOUTS: Record<
  string,
  { readonly columns: readonly string[]; readonly rows: number; readonly surcharge: number }
> = {
  FIRST: { columns: ['A', 'C', 'D', 'F'], rows: 4, surcharge: 12000 },
  BUSINESS: { columns: ['A', 'C', 'D', 'F', 'G', 'K'], rows: 6, surcharge: 9000 },
  PREMIUM_ECONOMY: { columns: ['A', 'C', 'D', 'F', 'G', 'K'], rows: 8, surcharge: 4500 },
  ECONOMY: { columns: ['A', 'B', 'C', 'D', 'E', 'F'], rows: 30, surcharge: 1500 },
};
