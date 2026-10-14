import { getDatabase, inTransaction, withWriteRetry } from '../db/connection.js';
import { AppError, ErrorCode } from '../lib/errors.js';

/**
 * Flight catalogue access: airports, airlines, flights, fares and seats.
 *
 * The original build spread these reads across a Prisma client and nine
 * DataLoaders. With one synchronous SQLite connection there is nothing to batch
 * across, so each call is a direct, indexed query and the N+1 problem the loaders
 * existed to solve does not arise.
 */

/** Rows come back snake_cased; the API speaks camelCase, so map once here. */
function mapAirport(row) {
  if (!row) return null;
  return {
    id: row.id,
    iataCode: row.iata_code,
    icaoCode: row.icao_code,
    name: row.name,
    city: row.city,
    country: row.country,
    timezone: row.timezone,
  };
}

function mapAirline(row) {
  if (!row) return null;
  return {
    id: row.id,
    iataCode: row.iata_code,
    icaoCode: row.icao_code,
    numericCode: row.numeric_code,
    name: row.name,
    logoUrl: row.logo_url,
  };
}

export function mapFlight(row) {
  if (!row) return null;
  return {
    id: row.id,
    flightNumber: row.flight_number,
    airlineId: row.airline_id,
    aircraftId: row.aircraft_id,
    originId: row.origin_id,
    destinationId: row.destination_id,
    departureAt: row.departure_at,
    arrivalAt: row.arrival_at,
    durationMinutes: row.duration_minutes,
    status: row.status,
    provider: row.provider,
    providerRef: row.provider_ref,
    seatLayoutId: row.seat_layout_id,
    seatsAvailable: row.seats_available,
  };
}

export function mapFare(row) {
  if (!row) return null;
  return {
    id: row.id,
    flightId: row.flight_id,
    fareClassId: row.fare_class_id,
    basePrice: row.base_price,
    taxes: row.taxes,
    fees: row.fees,
    // `total` is derived rather than stored: the three parts are the source of
    // truth and a stored total could drift from them.
    total: row.base_price + row.taxes + row.fees,
    currency: row.currency,
    seatsAvailable: row.seats_available,
  };
}

export function mapSeat(row) {
  if (!row) return null;
  return {
    id: row.id,
    flightId: row.flight_id,
    seatNumber: row.seat_number,
    row: row.row,
    column: row.column_letter,
    cabin: row.cabin,
    position: row.position,
    status: row.status,
    surcharge: row.surcharge,
    isExitRow: Boolean(row.is_exit_row),
    isBulkhead: Boolean(row.is_bulkhead),
    hasBassinet: Boolean(row.has_bassinet),
    holdExpiresAt: row.hold_expires_at,
  };
}

export function findAirportByIata(iataCode) {
  return mapAirport(
    getDatabase()
      .prepare('SELECT * FROM airports WHERE iata_code = ? AND is_active = 1')
      .get(String(iataCode).toUpperCase()),
  );
}

export function findAirportById(id) {
  return mapAirport(getDatabase().prepare('SELECT * FROM airports WHERE id = ?').get(id));
}

export function searchAirports(query) {
  const term = String(query ?? '').trim();
  if (term === '') return [];
  const upper = term.toUpperCase();
  const like = `%${term}%`;
  return getDatabase()
    .prepare(
      `SELECT * FROM airports
       WHERE is_active = 1
         AND (iata_code = ? OR city LIKE ? COLLATE NOCASE OR name LIKE ? COLLATE NOCASE)
       ORDER BY CASE WHEN iata_code = ? THEN 0 ELSE 1 END, city
       LIMIT 10`,
    )
    .all(upper, like, like, upper)
    .map(mapAirport);
}

export function listAirlines() {
  return getDatabase()
    .prepare('SELECT * FROM airlines WHERE is_active = 1 ORDER BY name LIMIT 100')
    .all()
    .map(mapAirline);
}

export function findAirlineById(id) {
  return mapAirline(getDatabase().prepare('SELECT * FROM airlines WHERE id = ?').get(id));
}

export function findAirlineByIata(iataCode) {
  return mapAirline(
    getDatabase().prepare('SELECT * FROM airlines WHERE iata_code = ?').get(String(iataCode).toUpperCase()),
  );
}

export function findFlightById(id) {
  return mapFlight(getDatabase().prepare('SELECT * FROM flights WHERE id = ?').get(id));
}

export function listFaresByFlight(flightId) {
  return getDatabase()
    .prepare(
      `SELECT f.*, fc.code AS class_code, fc.cabin, fc.name AS class_name,
              fc.baggage_allowance, fc.cabin_baggage, fc.is_changeable, fc.is_refundable,
              fc.change_fee, fc.cancel_fee, fc.tier
       FROM fares f
       JOIN fare_classes fc ON fc.id = f.fare_class_id
       WHERE f.flight_id = ?
       ORDER BY fc.tier ASC, f.base_price ASC`,
    )
    .all(flightId)
    .map((row) => ({
      ...mapFare(row),
      fareClass: {
        code: row.class_code,
        name: row.class_name,
        cabin: row.cabin,
        baggageAllowance: row.baggage_allowance,
        cabinBaggage: row.cabin_baggage,
        isChangeable: Boolean(row.is_changeable),
        isRefundable: Boolean(row.is_refundable),
        changeFee: row.change_fee,
        cancelFee: row.cancel_fee,
      },
    }));
}

export function listSeatsByFlight(flightId, cabin) {
  const sql = cabin
    ? 'SELECT * FROM seats WHERE flight_id = ? AND cabin = ? ORDER BY row ASC, column_letter ASC'
    : 'SELECT * FROM seats WHERE flight_id = ? ORDER BY row ASC, column_letter ASC';
  const statement = getDatabase().prepare(sql);
  const rows = cabin ? statement.all(flightId, cabin) : statement.all(flightId);
  return rows.map(mapSeat);
}

/**
 * Locks and re-reads seats inside the caller's transaction.
 *
 * SQLite has no `SELECT ... FOR UPDATE`, but the surrounding `BEGIN IMMEDIATE`
 * has already taken the write lock, so the row statuses read here cannot change
 * before the caller commits. This is the direct replacement for the Postgres
 * `FOR UPDATE` clause the original `lockSeats` used.
 */
export function readSeatsForUpdate(db, flightId, seatIds) {
  if (seatIds.length === 0) return [];
  const placeholders = seatIds.map(() => '?').join(', ');
  return db
    .prepare(`SELECT * FROM seats WHERE flight_id = ? AND id IN (${placeholders})`)
    .all(flightId, ...seatIds);
}

export function readSeatsByIds(db, seatIds) {
  if (seatIds.length === 0) return [];
  const placeholders = seatIds.map(() => '?').join(', ');
  return db.prepare(`SELECT * FROM seats WHERE id IN (${placeholders})`).all(...seatIds);
}

/** Reserved seat count for a flight, used to keep `flights.seats_available` honest. */
export function countAvailableSeats(flightId) {
  const row = getDatabase()
    .prepare("SELECT COUNT(*) AS count FROM seats WHERE flight_id = ? AND status = 'AVAILABLE'")
    .get(flightId);
  return row?.count ?? 0;
}

/**
 * Searches the local catalogue. Mirrors the original `MockProvider.search`:
 * a 36-hour departure window, fares filtered by cabin and remaining seats, and a
 * `limit * 3` over-fetch that the caller trims.
 */
export function searchCatalogue(params) {
  const origin = findAirportByIata(params.origin);
  const destination = findAirportByIata(params.destination);
  if (!origin || !destination) {
    throw new AppError(ErrorCode.INVALID_ROUTE, `Unknown route ${params.origin}-${params.destination}`);
  }

  const dayStart = new Date(`${params.departDate}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 36 * 3_600_000);
  const seatDemand = params.passengers.adults + params.passengers.children;

  const rows = getDatabase()
    .prepare(
      `SELECT * FROM flights
       WHERE origin_id = ? AND destination_id = ?
         AND status IN ('SCHEDULED', 'DELAYED')
         AND departure_at >= ? AND departure_at < ?
         AND seats_available > 0
       ORDER BY departure_at ASC
       LIMIT ?`,
    )
    .all(origin.id, destination.id, dayStart.toISOString(), dayEnd.toISOString(), params.limit * 3)
    .map(mapFlight);

  const itineraries = [];
  for (const flight of rows) {
    const fares = listFaresByFlight(flight.id)
      .filter((fare) => fare.fareClass.cabin === params.cabin && fare.seatsAvailable >= seatDemand);
    if (fares.length === 0) continue;

    itineraries.push({
      providerId: `mock:${flight.id}`,
      provider: 'mock',
      flight,
      fares,
    });
  }

  return itineraries.slice(0, params.limit);
}

/** Looks up a flight by its provider id, e.g. `mock:<uuid>`. */
export function extractFlightId(providerId) {
  const separator = String(providerId).indexOf(':');
  if (separator < 0) return null;
  const id = String(providerId).slice(separator + 1);
  return id === '' ? null : id;
}

export { inTransaction, withWriteRetry };
