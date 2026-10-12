import 'server-only';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CABIN_LAYOUTS,
  type Airport,
  type Airline,
  type Fare,
  type FlightRecord,
  type SeatMapRecord,
} from './types';

/**
 * Demo data source.
 *
 * The bundle ships a trimmed snapshot of the seeded catalogue under `data/`, so
 * the app can run without the API or a database. Everything here is read-only and
 * synchronous: the files are small, static, and read once per process.
 *
 * Server-only because it touches the filesystem. Client components import the
 * types from `lib/types` instead.
 *
 * Regenerate the snapshot with `scripts/export-demo-data.ps1`.
 */

const DATA_DIR = join(process.cwd(), 'data');

const cache = new Map<string, unknown>();

function readJson<T>(name: string): T {
  const cached = cache.get(name);
  if (cached !== undefined) return cached as T;

  const raw = readFileSync(join(DATA_DIR, `${name}.json`), 'utf8');
  const parsed = JSON.parse(raw) as T;
  cache.set(name, parsed);
  return parsed;
}

export function cabinLayout(cabin: string): {
  readonly columns: readonly string[];
  readonly rows: number;
  readonly surcharge: number;
} {
  return CABIN_LAYOUTS[cabin] ?? CABIN_LAYOUTS.ECONOMY!;
}

export const getAirports = (): readonly Airport[] => readJson<Airport[]>('airports');
export const getAirlines = (): readonly Airline[] => readJson<Airline[]>('airlines');
export const getFlights = (): readonly FlightRecord[] => readJson<FlightRecord[]>('flights');
export const getSeatMaps = (): readonly SeatMapRecord[] =>
  readJson<SeatMapRecord[]>('seat-maps');

export function getAirport(iataCode: string): Airport | undefined {
  const code = iataCode.trim().toUpperCase();
  return getAirports().find((airport) => airport.iataCode === code);
}

export function getFlight(id: string): FlightRecord | undefined {
  return getFlights().find((flight) => flight.id === id);
}

export function getSeatMap(flightId: string): SeatMapRecord | undefined {
  return getSeatMaps().find((seatMap) => seatMap.flightId === flightId);
}

export type { Airport, Airline, Fare, FlightRecord, SeatMapRecord };
