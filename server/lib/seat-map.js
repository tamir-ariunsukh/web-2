import { SeatPosition } from './enums.js';

/**
 * Seat geometry and map assembly.
 *
 * Layouts stay data, not code, so an airline can add an aircraft type without a
 * deployment. The helpers here are shared by the seed (which materialises seat
 * rows) and the API (which groups them back into a per-cabin map).
 */

/** Deck/position of a column within a row, derived from its index. */
export function positionForColumn(columnIndex, columnCount, aisleAfter) {
  const aisleBefore = columnIndex > 0 && aisleAfter.includes(columnIndex);
  const aisleAfterThis = aisleAfter.includes(columnIndex + 1);
  if (aisleBefore || aisleAfterThis) return SeatPosition.AISLE;

  if (columnIndex === 0 || columnIndex === columnCount - 1) return SeatPosition.WINDOW;

  // Immediately adjacent to an aisle on the far side counts as aisle too.
  for (const gap of aisleAfter) {
    if (columnIndex === gap - 1 || columnIndex === gap) return SeatPosition.AISLE;
  }
  return SeatPosition.MIDDLE;
}

/** Parses `12A` into its row and column parts, or `undefined` when malformed. */
export function parseSeatNumber(value) {
  const match = /^(\d{1,3})([A-Z])$/.exec(String(value ?? '').trim().toUpperCase());
  if (!match) return undefined;
  const row = Number(match[1]);
  const column = match[2];
  if (row < 1 || column === undefined) return undefined;
  return { row, column };
}

/**
 * Expands a layout into concrete seat rows: every cabin row crossed with every
 * column, minus the columns the row is missing.
 */
export function buildSeatRows(layout, { surchargeFor = () => 0 } = {}) {
  const rows = [];
  for (const cabin of layout.cabins) {
    const columnCount = cabin.columns.length;

    for (const row of cabin.rows) {
      for (let index = 0; index < columnCount; index += 1) {
        const column = cabin.columns[index];
        if (row.missingColumns?.includes(column)) continue;

        const isBlocked = row.blockedColumns?.includes(column) ?? false;
        const hasSurcharge = row.surchargeColumns?.includes(column) ?? false;

        rows.push({
          seatNumber: `${row.row}${column}`,
          row: row.row,
          column,
          cabin: row.overrides?.cabin ?? cabin.cabin,
          position:
            row.overrides?.position?.[column] ??
            positionForColumn(index, columnCount, cabin.aisleAfter ?? []),
          status: isBlocked ? 'BLOCKED' : 'AVAILABLE',
          surcharge: hasSurcharge ? (row.surcharge ?? 0) : surchargeFor(cabin.cabin, row.row),
          isExitRow: Boolean(row.isExitRow),
          isBulkhead: Boolean(row.isBulkhead),
          hasBassinet: Boolean(row.hasBassinet) && ['A', 'F', 'K'].includes(column),
        });
      }
    }
  }
  return rows;
}

/** Total seat count a layout produces, used when seeding `flights.seatsAvailable`. */
export function seatCountFor(layout) {
  return buildSeatRows(layout).length;
}

/** Groups flat seat rows into the nested map the UI renders. */
export function buildSeatMap({ layoutId, aircraftModel, configuration, seats, now = Date.now() }) {
  const views = seats.map((seat) => {
    const holdLapsed =
      seat.holdExpiresAt !== null &&
      seat.holdExpiresAt !== undefined &&
      Date.parse(seat.holdExpiresAt) < now;
    const status = holdLapsed && seat.status === 'HELD' ? 'AVAILABLE' : seat.status;

    return {
      id: seat.id,
      seatNumber: seat.seatNumber,
      row: seat.row,
      column: seat.column,
      cabin: seat.cabin,
      position: seat.position,
      status,
      price: seat.surcharge,
      isExitRow: Boolean(seat.isExitRow),
      isBulkhead: Boolean(seat.isBulkhead),
      hasBassinet: Boolean(seat.hasBassinet),
      ...(status === 'HELD' && seat.holdExpiresAt && !holdLapsed
        ? { holdExpiresAt: seat.holdExpiresAt }
        : {}),
    };
  });

  const byCabin = new Map();
  for (const view of views) {
    if (!byCabin.has(view.cabin)) byCabin.set(view.cabin, []);
    byCabin.get(view.cabin).push(view);
  }

  const cabins = [];
  for (const [cabin, cabinSeats] of byCabin) {
    const columns = Array.from(new Set(cabinSeats.map((seat) => seat.column))).sort();
    const rowsByNumber = new Map();
    for (const seat of cabinSeats) {
      if (!rowsByNumber.has(seat.row)) rowsByNumber.set(seat.row, []);
      rowsByNumber.get(seat.row).push(seat);
    }

    const rows = Array.from(rowsByNumber.keys())
      .sort((a, b) => a - b)
      .map((rowNumber) => {
        const rowSeats = rowsByNumber.get(rowNumber).slice().sort((a, b) => (a.column < b.column ? -1 : 1));
        const first = rowSeats[0];
        return {
          row: rowNumber,
          isExitRow: first.isExitRow,
          isBulkhead: first.isBulkhead,
          hasBassinet: first.hasBassinet,
          seats: rowSeats,
          aislesAfter: aislesFor(columns),
        };
      });

    cabins.push({ cabin, label: cabinLabel(cabin), rows, columns });
  }

  return {
    layoutId: layoutId ?? 'unknown',
    aircraftModel: aircraftModel ?? 'Unknown',
    configuration: configuration ?? configurationLabel(cabins.map((entry) => entry.columns.length)),
    cabins,
    summary: summariseSeats(views),
  };
}

/** Column index positions where an aisle falls, derived from letter gaps. */
function aislesFor(columns) {
  const aisles = [];
  for (let index = 1; index < columns.length; index += 1) {
    if (columns[index].charCodeAt(0) - columns[index - 1].charCodeAt(0) > 1) {
      aisles.push(index);
    }
  }
  return aisles;
}

export function summariseSeats(seats) {
  const counters = { AVAILABLE: 0, HELD: 0, BOOKED: 0, BLOCKED: 0 };
  for (const seat of seats) counters[seat.status] += 1;
  return {
    totalSeats: seats.length,
    available: counters.AVAILABLE,
    held: counters.HELD,
    booked: counters.BOOKED,
    blocked: counters.BLOCKED,
  };
}

export function cabinLabel(cabin) {
  return (
    {
      FIRST: 'First',
      BUSINESS: 'Business',
      PREMIUM_ECONOMY: 'Premium Economy',
      ECONOMY: 'Economy',
    }[cabin] ?? cabin
  );
}

/**
 * `3-3` for a narrow-body, `2-2-2 / 3-3-3` for a wide-body. Derived from the
 * column counts so it cannot drift from the layout data.
 */
function configurationLabel(columnCounts) {
  if (columnCounts.length === 0) return 'unconfigured';
  return columnCounts
    .map((count) => (count > 0 ? Math.ceil(count / 2) : count))
    .join('-');
}
