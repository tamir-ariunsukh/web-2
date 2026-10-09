import DataLoader from 'dataloader';

import type { PrismaClient } from '@repo/db';
import type { Logger } from 'pino';


/**
 * Per-request batch loaders.
 *
 * GraphQL resolves fields independently, so a naive resolver fetches the same
 * airline once per flight in a result set. DataLoader collapses those calls into
 * one query per tick and caches the result for the lifetime of the request.
 */

export interface Loaders {
  readonly airlineById: DataLoader<string, AirlineRow | null>;
  readonly airportById: DataLoader<string, AirportRow | null>;
  readonly airportByIata: DataLoader<string, AirportRow | null>;
  readonly faresByFlightId: DataLoader<string, FareRow[]>;
  readonly seatsByFlightId: DataLoader<string, SeatRow[]>;
  readonly segmentsByBookingPnr: DataLoader<string, SegmentRow[]>;
  readonly passengersByBookingPnr: DataLoader<string, PassengerRow[]>;
  readonly paymentsByBookingPnr: DataLoader<string, PaymentRow[]>;
  readonly ticketsByBookingPnr: DataLoader<string, TicketRow[]>;
}

export interface AirlineRow {
  id: string;
  iataCode: string;
  name: string;
  logoUrl: string | null;
  numericCode: string;
}

export interface AirportRow {
  id: string;
  iataCode: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
}

export interface FareRow {
  id: string;
  flightId: string;
  basePrice: number;
  taxes: number;
  fees: number;
  currency: string;
  seatsAvailable: number;
  fareClass: { code: string; cabin: string; name: string; isRefundable: boolean };
}

export interface SeatRow {
  id: string;
  flightId: string;
  seatNumber: string;
  row: number;
  column: string;
  cabin: string;
  position: string;
  status: string;
  surcharge: number;
  isExitRow: boolean;
  isBulkhead: boolean;
  hasBassinet: boolean;
  holdExpiresAt: Date | null;
}

export interface SegmentRow {
  id: string;
  bookingPnr: string;
  sequence: number;
  flightId: string;
  fareId: string;
  baseFare: number;
  taxes: number;
  fees: number;
}

export interface PassengerRow {
  id: string;
  bookingPnr: string;
  sequence: number;
  type: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  dateOfBirth: Date;
  gender: string;
  nationality: string | null;
  passportLast4: string | null;
}

export interface PaymentRow {
  id: string;
  bookingPnr: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  cardSummary: string | null;
  createdAt: Date;
}

export interface TicketRow {
  id: string;
  bookingPnr: string;
  segmentId: string;
  passengerId: string;
  ticketNumber: string;
  status: string;
  issuedAt: Date | null;
  pdfKey: string | null;
}

/** Groups rows by a key so a batched query can be fanned back out. */
function groupBy<T extends Record<K, string>, K extends keyof T>(
  rows: readonly T[],
  key: K,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = row[key];
    const bucket = grouped.get(value);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(value, [row]);
    }
  }
  return grouped;
}

export function createLoaders(prisma: PrismaClient, logger: Logger): Loaders {
  // Batched reads are logged at debug level so a hot request path stays quiet.
  const trace = (entity: string, batchSize: number): void => {
    logger.debug({ entity, batchSize }, 'dataloader batch');
  };

  return {
    airlineById: new DataLoader<string, AirlineRow | null>(
      async (ids) => {
        trace('airline', ids.length);
        const rows = await prisma.airline.findMany({
          where: { id: { in: [...ids] } },
          select: {
            id: true,
            iataCode: true,
            name: true,
            logoUrl: true,
            numericCode: true,
          },
        });
        const map = new Map(rows.map((row) => [row.id, row]));
        return ids.map((id) => map.get(id) ?? null);
      },
      { cacheKeyFn: String },
    ),

    airportById: new DataLoader<string, AirportRow | null>(
      async (ids) => {
        const rows = await prisma.airport.findMany({
          where: { id: { in: [...ids] } },
          select: {
            id: true,
            iataCode: true,
            name: true,
            city: true,
            country: true,
            timezone: true,
          },
        });
        const map = new Map(rows.map((row) => [row.id, row]));
        return ids.map((id) => map.get(id) ?? null);
      },
      { cacheKeyFn: String },
    ),

    airportByIata: new DataLoader<string, AirportRow | null>(
      async (codes) => {
        const rows = await prisma.airport.findMany({
          where: { iataCode: { in: [...codes] } },
          select: {
            id: true,
            iataCode: true,
            name: true,
            city: true,
            country: true,
            timezone: true,
          },
        });
        const map = new Map(rows.map((row) => [row.iataCode, row]));
        return codes.map((code) => map.get(code) ?? null);
      },
      { cacheKeyFn: (key) => key.toUpperCase() },
    ),

    faresByFlightId: new DataLoader<string, FareRow[]>(
      async (flightIds) => {
        const rows = await prisma.fare.findMany({
          where: { flightId: { in: [...flightIds] } },
          select: {
            id: true,
            flightId: true,
            basePrice: true,
            taxes: true,
            fees: true,
            currency: true,
            seatsAvailable: true,
            fareClass: {
              select: {
                code: true,
                cabin: true,
                name: true,
                isRefundable: true,
              },
            },
          },
          orderBy: [{ fareClass: { tier: 'asc' } }, { basePrice: 'asc' }],
        });
        const grouped = groupBy(rows, 'flightId');
        return flightIds.map((id) => grouped.get(id) ?? []);
      },
      { cacheKeyFn: String },
    ),

    seatsByFlightId: new DataLoader<string, SeatRow[]>(
      async (flightIds) => {
        const rows = await prisma.seat.findMany({
          where: { flightId: { in: [...flightIds] } },
          select: {
            id: true,
            flightId: true,
            seatNumber: true,
            row: true,
            column: true,
            cabin: true,
            position: true,
            status: true,
            surcharge: true,
            isExitRow: true,
            isBulkhead: true,
            hasBassinet: true,
            holdExpiresAt: true,
          },
          orderBy: [{ row: 'asc' }, { column: 'asc' }],
        });
        const grouped = groupBy(rows, 'flightId');
        return flightIds.map((id) => grouped.get(id) ?? []);
      },
      { cacheKeyFn: String },
    ),

    segmentsByBookingPnr: new DataLoader<string, SegmentRow[]>(
      async (pnrs) => {
        const rows = await prisma.bookingSegment.findMany({
          where: { bookingPnr: { in: [...pnrs] } },
          select: {
            id: true,
            bookingPnr: true,
            sequence: true,
            flightId: true,
            fareId: true,
            baseFare: true,
            taxes: true,
            fees: true,
          },
          orderBy: { sequence: 'asc' },
        });
        const grouped = groupBy(rows, 'bookingPnr');
        return pnrs.map((pnr) => grouped.get(pnr) ?? []);
      },
      { cacheKeyFn: (key) => key.toUpperCase() },
    ),

    passengersByBookingPnr: new DataLoader<string, PassengerRow[]>(
      async (pnrs) => {
        const rows = await prisma.passenger.findMany({
          where: { bookingPnr: { in: [...pnrs] } },
          select: {
            id: true,
            bookingPnr: true,
            sequence: true,
            type: true,
            firstName: true,
            middleName: true,
            lastName: true,
            dateOfBirth: true,
            gender: true,
            nationality: true,
            passportLast4: true,
          },
          orderBy: { sequence: 'asc' },
        });
        const grouped = groupBy(rows, 'bookingPnr');
        return pnrs.map((pnr) => grouped.get(pnr) ?? []);
      },
      { cacheKeyFn: (key) => key.toUpperCase() },
    ),

    paymentsByBookingPnr: new DataLoader<string, PaymentRow[]>(
      async (pnrs) => {
        const rows = await prisma.payment.findMany({
          where: { bookingPnr: { in: [...pnrs] } },
          select: {
            id: true,
            bookingPnr: true,
            amount: true,
            currency: true,
            status: true,
            method: true,
            cardSummary: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });
        const grouped = groupBy(rows, 'bookingPnr');
        return pnrs.map((pnr) => grouped.get(pnr) ?? []);
      },
      { cacheKeyFn: (key) => key.toUpperCase() },
    ),

    ticketsByBookingPnr: new DataLoader<string, TicketRow[]>(
      async (pnrs) => {
        const rows = await prisma.ticket.findMany({
          where: { bookingPnr: { in: [...pnrs] } },
          select: {
            id: true,
            bookingPnr: true,
            segmentId: true,
            passengerId: true,
            ticketNumber: true,
            status: true,
            issuedAt: true,
            pdfKey: true,
          },
        });
        const grouped = groupBy(rows, 'bookingPnr');
        return pnrs.map((pnr) => grouped.get(pnr) ?? []);
      },
      { cacheKeyFn: (key) => key.toUpperCase() },
    ),
  };
}
