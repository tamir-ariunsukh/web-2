import type { CabinClass, SeatStatus } from './enums.js';

/**
 * Aircraft seat-map geometry. Layouts are data, not code, so an airline can add
 * an aircraft type without a deployment.
 */

export const SeatPosition = {
  WINDOW: 'WINDOW',
  MIDDLE: 'MIDDLE',
  AISLE: 'AISLE',
} as const;
export type SeatPosition = (typeof SeatPosition)[keyof typeof SeatPosition];

export interface SeatDefinition {
  /** e.g. `12A`. */
  readonly seatNumber: string;
  readonly row: number;
  /** Column letter, e.g. `A`. */
  readonly column: string;
  readonly cabin: CabinClass;
  readonly position: SeatPosition;
  /** Exit-row seats have extra legroom and are usually restricted. */
  readonly isExitRow: boolean;
  /** Bulkhead seats have a fixed armrest and often hold the bassinet. */
  readonly isBulkhead: boolean;
  /** True when this seat is certified for an infant bassinet. */
  readonly hasBassinet: boolean;
  /** Not sellable — crew rest, inoperative, or blocked for balance. */
  readonly isBlocked: boolean;
  /** Extra charge on top of the fare, in minor units. */
  readonly surcharge: number;
}

export interface CabinLayout {
  readonly cabin: CabinClass;
  /** Human label, e.g. `Economy`. */
  readonly label: string;
  readonly firstRow: number;
  readonly lastRow: number;
  /** Column letters in left-to-right order. */
  readonly columns: readonly string[];
  /** Aisle positions expressed as gaps before column index N, e.g. `[3]`. */
  readonly aisleAfter: readonly number[];
  readonly rows: readonly SeatRowLayout[];
}

export interface SeatRowLayout {
  readonly row: number;
  readonly isExitRow: boolean;
  readonly isBulkhead: boolean;
  readonly hasBassinet: boolean;
  /** Column letters missing on this row, e.g. an absent middle seat. */
  readonly missingColumns: readonly string[];
  /** Column letters that are not sellable on this row. */
  readonly blockedColumns: readonly string[];
  /** Column letters that carry a surcharge on this row. */
  readonly surchargeColumns: readonly string[];
  readonly surcharge: number;
  readonly overrides?: {
    readonly cabin?: CabinClass;
    readonly position?: Readonly<Record<string, SeatPosition>>;
  };
}

export interface SeatLayout {
  readonly id: string;
  readonly aircraftModel: string;
  /** e.g. `3-3` for narrow-body, `2-4-2` for wide-body. */
  readonly configuration: string;
  readonly cabins: readonly CabinLayout[];
}

/**
 * Deterministic catalogue of seat numbers for a layout. Used by the seat-map
 * generator and by tests that assert a given layout's exact capacity.
 */
export function seatNumbers(layout: SeatLayout): string[] {
  const numbers: string[] = [];
  for (const cabin of layout.cabins) {
    for (const row of cabin.rows) {
      for (const column of cabin.columns) {
        if (row.missingColumns.includes(column)) continue;
        numbers.push(`${row.row}${column}`);
      }
    }
  }
  return numbers;
}

/** Deck/position of a column within a row, derived from its index. */
export function positionForColumn(
  columnIndex: number,
  columnCount: number,
  aisleAfter: readonly number[],
): SeatPosition {
  const aisleBefore = columnIndex > 0 && aisleAfter.includes(columnIndex);
  const aisleAfterThis = aisleAfter.includes(columnIndex + 1);

  if (aisleBefore || aisleAfterThis) return SeatPosition.AISLE;

  // Leftmost and rightmost non-aisle seats are windows.
  const leftMost = columnIndex === 0;
  const rightMost = columnIndex === columnCount - 1;
  if (leftMost || rightMost) return SeatPosition.WINDOW;

  // Immediately adjacent to an aisle on the far side counts as aisle too.
  for (const gap of aisleAfter) {
    if (columnIndex === gap - 1 || columnIndex === gap) return SeatPosition.AISLE;
  }

  return SeatPosition.MIDDLE;
}

/**
 * Parses a seat number into its row and column parts. Returns `undefined` for
 * malformed input so callers can respond with `SEAT_NOT_FOUND`.
 */
export function parseSeatNumber(
  value: string,
): { row: number; column: string } | undefined {
  const match = /^(\d{1,3})([A-Z])$/.exec(value.trim().toUpperCase());
  if (!match) return undefined;
  const row = Number(match[1]);
  const column = match[2];
  if (row < 1 || column === undefined) return undefined;
  return { row, column };
}

export interface SeatView {
  readonly id: string;
  readonly seatNumber: string;
  readonly row: number;
  readonly column: string;
  readonly cabin: CabinClass;
  readonly position: SeatPosition;
  readonly status: SeatStatus;
  readonly price: number;
  readonly isExitRow: boolean;
  readonly isBulkhead: boolean;
  readonly hasBassinet: boolean;
  /** Set when the seat is HELD, so the UI can show a countdown. */
  readonly holdExpiresAt?: string;
}

export interface SeatMapRow {
  readonly row: number;
  readonly isExitRow: boolean;
  readonly isBulkhead: boolean;
  readonly hasBassinet: boolean;
  readonly seats: readonly SeatView[];
  /** Column index positions where the aisle is rendered. */
  readonly aislesAfter: readonly number[];
}

export interface SeatMapCabin {
  readonly cabin: CabinClass;
  readonly label: string;
  readonly rows: readonly SeatMapRow[];
  readonly columns: readonly string[];
}

export interface SeatMap {
  readonly layoutId: string;
  readonly aircraftModel: string;
  readonly configuration: string;
  readonly cabins: readonly SeatMapCabin[];
  readonly summary: SeatMapSummary;
}

export interface SeatMapSummary {
  readonly totalSeats: number;
  readonly available: number;
  readonly held: number;
  readonly booked: number;
  readonly blocked: number;
}

export function summariseSeats(seats: readonly SeatView[]): SeatMapSummary {
  const counters: Record<SeatStatus, number> = {
    AVAILABLE: 0,
    HELD: 0,
    BOOKED: 0,
    BLOCKED: 0,
  };
  for (const seat of seats) {
    counters[seat.status] += 1;
  }

  return {
    totalSeats: seats.length,
    available: counters.AVAILABLE,
    held: counters.HELD,
    booked: counters.BOOKED,
    blocked: counters.BLOCKED,
  };
}

/** Recommended column range for a party travelling together. */
export function findAdjacentSeats(
  row: SeatMapRow,
  count: number,
  isAcceptable: (seat: SeatView) => boolean,
): SeatView[] {
  const seats = row.seats.filter(isAcceptable);
  if (count > seats.length) return [];

  for (let start = 0; start <= seats.length - count; start += 1) {
    const window = seats.slice(start, start + count);
    const contiguous = window.every((seat, offset) => {
      if (offset === 0) return true;
      const previous = window[offset - 1];
      return previous !== undefined && seat.column.charCodeAt(0) === previous.column.charCodeAt(0) + 1;
    });
    if (contiguous) return window;
  }

  return [];
}
