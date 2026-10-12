'use client';

import { CABIN_LAYOUTS } from './types';

import type { SeatMapRecord } from './types';
import type {
  CabinClass,
  SeatMap,
  SeatMapCabin,
  SeatMapRow,
  SeatPosition,
  SeatStatus,
  SeatView,
} from '@repo/shared';

/**
 * Demo seat map.
 *
 * The snapshot stores one summary row per flight; the individual seats are
 * derived here from a fixed layout per cabin plus a deterministic hash, so a
 * seat's status never changes between renders.
 *
 * Takes the flight record as an argument rather than reading it, because this
 * runs in the browser and the data files are server-only.
 */

const CABIN_ORDER: readonly CabinClass[] = ['FIRST', 'BUSINESS', 'PREMIUM_ECONOMY', 'ECONOMY'];

const CABIN_LABELS: Record<string, string> = {
  FIRST: 'First',
  BUSINESS: 'Business',
  PREMIUM_ECONOMY: 'Premium Economy',
  ECONOMY: 'Economy',
};

/** Stable 32-bit FNV-1a hash, so seat status is stable per flight. */
function hash(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Column index positions where the aisle is rendered. */
function aislesFor(columns: readonly string[]): number[] {
  if (columns.length < 4) return [];
  return [Math.ceil(columns.length / 2) - 1];
}

function positionFor(index: number, columns: readonly string[]): SeatPosition {
  const aisles = aislesFor(columns);
  if (index === 0 || index === columns.length - 1) return 'WINDOW';
  for (const gap of aisles) {
    if (index === gap || index === gap + 1) return 'AISLE';
  }
  return 'MIDDLE';
}

function buildCabin(
  flightId: string,
  cabin: CabinClass,
  layout: { readonly columns: readonly string[]; readonly rows: number; readonly surcharge: number },
  takenRatio: number,
): SeatMapCabin {
  const columns = layout.columns;
  const aislesAfter = aislesFor(columns);
  const rows: SeatMapRow[] = [];

  for (let row = 1; row <= layout.rows; row += 1) {
    const seats: SeatView[] = columns.map((column, index) => {
      const seatNumber = `${row}${column}`;
      const seed = hash(`${flightId}:${seatNumber}`);

      let status: SeatStatus = 'AVAILABLE';
      if (seed % 100 < takenRatio * 100) status = 'BOOKED';
      if (seed % 89 === 0) status = 'BLOCKED';

      const position = positionFor(index, columns);
      // Surcharges are minor units, like fares: a window or front-row seat adds
      // a modest premium rather than dominating the fare.
      const price = layout.surcharge + (position === 'WINDOW' ? 500 : 0) + (row <= 4 ? 800 : 0);

      return {
        id: `${flightId}-${seatNumber}`,
        seatNumber,
        row,
        column,
        cabin,
        position,
        status,
        price,
        isExitRow: row === Math.ceil(layout.rows / 2),
        isBulkhead: row === 1,
        hasBassinet: row === 1 && position === 'WINDOW',
      };
    });

    rows.push({
      row,
      isExitRow: row === Math.ceil(layout.rows / 2),
      isBulkhead: row === 1,
      hasBassinet: row === 1,
      seats,
      aislesAfter,
    });
  }

  return { cabin, label: CABIN_LABELS[cabin] ?? cabin, rows, columns };
}

function layoutFor(cabin: string): {
  readonly columns: readonly string[];
  readonly rows: number;
  readonly surcharge: number;
} {
  return CABIN_LAYOUTS[cabin] ?? CABIN_LAYOUTS.ECONOMY!;
}

export function buildSeatMap(record: SeatMapRecord): SeatMap {
  const cabins: SeatMapCabin[] = [];

  for (const cabin of CABIN_ORDER) {
    const summary = record.cabins.find((entry) => entry.cabin === cabin);
    if (!summary || summary.totalSeats === 0) continue;

    // Taken ratio comes from the seeded snapshot, so the map reflects the data.
    const takenRatio = (summary.booked + summary.blocked) / summary.totalSeats;
    cabins.push(buildCabin(record.flightId, cabin, layoutFor(cabin), takenRatio));
  }

  const seats = cabins.flatMap((cabin) => cabin.rows.flatMap((row) => row.seats));
  const count = (status: SeatStatus): number =>
    seats.filter((seat) => seat.status === status).length;

  return {
    layoutId: record.aircraftModel,
    aircraftModel: record.aircraftModel,
    configuration: record.configuration,
    cabins,
    summary: {
      totalSeats: seats.length,
      available: count('AVAILABLE'),
      held: count('HELD'),
      booked: count('BOOKED'),
      blocked: count('BLOCKED'),
    },
  };
}
