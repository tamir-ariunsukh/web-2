import { type CabinClass, CorsairError, ErrorCode, summariseSeats, type SeatMap, type SeatView } from '@repo/shared';

import type { GraphQLContext } from '../context.js';

/**
 * Builds the seat map for a flight.
 *
 * Seat rows are materialised per flight, so the map is a plain read plus a
 * group-by; no geometry is recomputed here. Expired holds are reported as
 * available so the UI does not show a seat as taken when the expiry worker has
 * not yet swept it.
 */

export async function buildSeatMap(
  context: GraphQLContext,
  flightId: string,
  cabin?: string,
): Promise<SeatMap> {
  const flight = await context.prisma.flight.findUnique({
    where: { id: flightId },
    select: {
      id: true,
      aircraftId: true,
      aircraft: { select: { model: true } },
    },
  });

  if (!flight) {
    throw CorsairError.notFound('Flight', flightId);
  }

  const seats = await context.prisma.seat.findMany({
    where: {
      flightId,
      ...(cabin ? { cabin: assertCabin(cabin) } : {}),
    },
    select: {
      id: true,
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

  const now = Date.now();

  const views: SeatView[] = seats.map((seat) => {
    // A lapsed hold is sellable again even before the sweep runs.
    const holdLapsed = seat.holdExpiresAt !== null && seat.holdExpiresAt.getTime() < now;
    const status = holdLapsed && seat.status === 'HELD' ? 'AVAILABLE' : seat.status;

    return {
      id: seat.id,
      seatNumber: seat.seatNumber,
      row: seat.row,
      column: seat.column,
      cabin: seat.cabin,
      position: seat.position,
      status: status,
      price: seat.surcharge,
      isExitRow: seat.isExitRow,
      isBulkhead: seat.isBulkhead,
      hasBassinet: seat.hasBassinet,
      ...(status === 'HELD' && seat.holdExpiresAt
        ? { holdExpiresAt: seat.holdExpiresAt.toISOString() }
        : {}),
    };
  });

  const byCabin = new Map<string, SeatView[]>();
  for (const seat of views) {
    const bucket = byCabin.get(seat.cabin);
    if (bucket) {
      bucket.push(seat);
    } else {
      byCabin.set(seat.cabin, [seat]);
    }
  }

  const cabins = [...byCabin.entries()].map(([cabinName, cabinSeats]) => {
    // Aisles are inferred from gaps in the column sequence: column letters are
    // contiguous, so a jump of more than one letter marks an aisle boundary.
    const columns = [...new Set(cabinSeats.map((seat) => seat.column))].sort();

    const byRow = new Map<number, SeatView[]>();
    for (const seat of cabinSeats) {
      const bucket = byRow.get(seat.row);
      if (bucket) {
        bucket.push(seat);
      } else {
        byRow.set(seat.row, [seat]);
      }
    }

    const rows = [...byRow.entries()]
      .sort(([a], [b]) => a - b)
      .map(([row, rowSeats]) => {
        const first = rowSeats[0];
        return {
          row,
          isExitRow: first?.isExitRow ?? false,
          isBulkhead: first?.isBulkhead ?? false,
          hasBassinet: first?.hasBassinet ?? false,
          seats: rowSeats.sort((a, b) => a.column.localeCompare(b.column)),
          aislesAfter: aislesFor(columns),
        };
      });

    return {
      cabin: cabinName as CabinClass,
      label: cabinLabel(cabinName),
      columns,
      rows,
    };
  });

  return {
    layoutId: flight.aircraftId ?? flight.id,
    aircraftModel: flight.aircraft?.model ?? 'Unknown',
    configuration: configurationLabel(cabins.map((cabin) => cabin.columns.length)),
    cabins,
    summary: summariseSeats(views),
  };
}

/** Column indices after which an aisle is rendered. */
function aislesFor(columns: readonly string[]): number[] {
  const aisles: number[] = [];
  for (let index = 1; index < columns.length; index += 1) {
    const previous = columns[index - 1];
    const current = columns[index];
    if (previous === undefined || current === undefined) continue;
    if (current.charCodeAt(0) - previous.charCodeAt(0) > 1) {
      aisles.push(index);
    }
  }
  return aisles;
}

function cabinLabel(cabin: string): string {
  const labels: Record<string, string> = {
    ECONOMY: 'Economy',
    PREMIUM_ECONOMY: 'Premium Economy',
    BUSINESS: 'Business',
    FIRST: 'First',
  };
  return labels[cabin] ?? cabin;
}

/** Renders the column count per cabin as a `3-3` style label. */
function configurationLabel(columnCounts: readonly number[]): string {
  if (columnCounts.length === 0) return 'unconfigured';
  return columnCounts.map((count) => (count > 0 ? Math.ceil(count / 2) : count)).join('-');
}

/** Guards a cabin value arriving from an untyped GraphQL argument. */
function assertCabin(value: string): CabinClass {
  const cabins = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'] as const;
  if (!cabins.includes(value as CabinClass)) {
    throw new CorsairError(ErrorCode.VALIDATION_FAILED, `Unknown cabin ${value}`);
  }
  return value as CabinClass;
}
