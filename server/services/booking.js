import { getDatabase, inTransaction, withWriteRetry } from '../db/connection.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { BookingStatus, PassengerType, UserRole } from '../lib/enums.js';
import { generatePnr } from '../lib/ids.js';
import { encryptPii } from '../lib/crypto.js';
import { computeTotal } from '../lib/money.js';
import { holdSeats } from './seat-inventory.js';
import {
  guardBookingTransition,
  releasesSeats,
  requiresRefund,
  requiresTicketVoid,
} from '../lib/state-machine.js';
import { assertValid, validateCreateBooking, validateSeatSelections } from '../lib/validation.js';

/**
 * Booking lifecycle.
 *
 * `transitionBooking` is the only writer of `bookings.status`, and it always
 * consults the state machine first, so an illegal status can never reach the
 * table. Seat side effects hang off the same transition: releasing on expiry or
 * cancellation, promoting to BOOKED on confirmation.
 */

const PNR_ATTEMPTS = 5;
const DEFAULT_HOLD_MINUTES = 15;

export function mapBooking(row) {
  if (!row) return null;
  return {
    pnr: row.pnr,
    id: row.id,
    userId: row.user_id,
    status: row.status,
    price: {
      baseFare: row.base_fare,
      taxes: row.taxes,
      fees: row.fees,
      discount: row.discount,
      total: row.total,
      currency: row.currency,
    },
    currency: row.currency,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    homeAddress: row.home_address,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
    ticketedAt: row.ticketed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  };
}

export function mapPassenger(row) {
  if (!row) return null;
  return {
    id: row.id,
    sequence: row.sequence,
    type: row.type,
    gender: row.gender,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth,
    nationality: row.nationality,
    passportLast4: row.passport_last4,
  };
}

export function findBookingByPnr(pnr) {
  return getDatabase()
    .prepare('SELECT * FROM bookings WHERE pnr = ?')
    .get(String(pnr).toUpperCase());
}

/** Allocates a free PNR, retrying on the (vanishingly unlikely) collision. */
function allocatePnr(db) {
  for (let attempt = 0; attempt < PNR_ATTEMPTS; attempt += 1) {
    const candidate = generatePnr();
    const existing = db.prepare('SELECT pnr FROM bookings WHERE pnr = ?').get(candidate);
    if (!existing) return candidate;
  }
  throw AppError.internal('Unable to allocate a unique booking reference');
}

/** Prices an itinerary from the fares the traveller selected. */
function priceItinerary(db, requested) {
  const priced = [];
  for (const segment of requested) {
    const row = db
      .prepare(
        `SELECT f.*, fl.id AS fid
         FROM fares f JOIN flights fl ON fl.id = f.flight_id
         WHERE f.id = ?`,
      )
      .get(segment.fareId);

    if (!row || row.flight_id !== segment.flightId) {
      throw new AppError(ErrorCode.FARE_NO_LONGER_AVAILABLE, 'This fare is no longer available');
    }
    if (row.seats_available <= 0) {
      throw new AppError(ErrorCode.FARE_NO_LONGER_AVAILABLE, 'This fare is sold out');
    }

    priced.push({
      flightId: row.flight_id,
      fareId: row.id,
      baseFare: row.base_price,
      taxes: row.taxes,
      fees: row.fees,
      currency: row.currency,
    });
  }

  const currency = priced[0].currency ?? 'USD';
  if (priced.some((segment) => segment.currency !== currency)) {
    throw AppError.validation('All segments in a booking must use the same currency');
  }

  return {
    segments: priced,
    baseFare: priced.reduce((sum, segment) => sum + segment.baseFare, 0),
    taxes: priced.reduce((sum, segment) => sum + segment.taxes, 0),
    fees: priced.reduce((sum, segment) => sum + segment.fees, 0),
    discount: 0,
    currency,
  };
}

/**
 * Creates a HELD booking for an authenticated customer or a guest.
 *
 * Returns the PNR. A repeated call with the same `idempotencyKey` returns the
 * original PNR instead of creating a second booking, which is what makes a
 * double-submitted checkout safe.
 */
export function createBooking(input, { user, env } = {}) {
  const parsed = assertValid(validateCreateBooking(input));

  if (parsed.idempotencyKey) {
    const existing = getDatabase()
      .prepare('SELECT pnr FROM bookings WHERE idempotency_key = ?')
      .get(parsed.idempotencyKey);
    if (existing) return existing.pnr;
  }

  return withWriteRetry(() =>
    inTransaction((db) => {
      const reference = allocatePnr(db);
      const priced = priceItinerary(db, parsed.segments);
      const total = computeTotal({
        baseFare: priced.baseFare,
        taxes: priced.taxes,
        fees: priced.fees,
        discount: priced.discount,
      });

      const now = new Date();
      const expiresAt = new Date(now.getTime() + DEFAULT_HOLD_MINUTES * 60_000).toISOString();

      db.prepare(
        `INSERT INTO bookings (
           pnr, id, user_id, status, base_fare, taxes, fees, discount, total, currency,
           contact_email, contact_phone, emergency_contact_name, emergency_contact_phone,
           home_address, expires_at, idempotency_key, source
         ) VALUES (?, ?, ?, 'HELD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        reference,
        crypto.randomUUID(),
        user?.id ?? null,
        priced.baseFare,
        priced.taxes,
        priced.fees,
        priced.discount,
        total.total,
        priced.currency,
        parsed.contactEmail,
        parsed.contactPhone,
        parsed.emergencyContactName ?? null,
        parsed.emergencyContactPhone ?? null,
        parsed.homeAddress ?? null,
        expiresAt,
        parsed.idempotencyKey ?? null,
        user ? 'web' : 'guest',
      );

      const insertSegment = db.prepare(
        `INSERT INTO booking_segments (id, booking_pnr, flight_id, fare_id, sequence, base_fare, taxes, fees)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      priced.segments.forEach((segment, index) => {
        insertSegment.run(
          crypto.randomUUID(),
          reference,
          segment.flightId,
          segment.fareId,
          index,
          segment.baseFare,
          segment.taxes,
          segment.fees,
        );
      });

      const insertPassenger = db.prepare(
        `INSERT INTO passengers (
           id, booking_pnr, sequence, type, gender, first_name, middle_name, last_name,
           date_of_birth, passport_number_enc, passport_last4, passport_expiry,
           passport_issuing_country, nationality
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      parsed.passengers.forEach((passenger, index) => {
        const hasPassport = passenger.passportNumber !== undefined;
        insertPassenger.run(
          crypto.randomUUID(),
          reference,
          index,
          passenger.type,
          passenger.gender,
          passenger.firstName,
          passenger.middleName ?? null,
          passenger.lastName,
          passenger.dateOfBirth,
          // The full document number is encrypted at rest; the last four digits
          // stay in the clear so staff can confirm a document without decrypting.
          hasPassport ? encryptPii(passenger.passportNumber, env.piiKey) : null,
          hasPassport ? passenger.passportNumber.slice(-4) : null,
          passenger.passportExpiry ?? null,
          passenger.passportIssuingCountry ?? null,
          passenger.nationality ?? null,
        );
      });

      db.prepare(
        `INSERT INTO booking_events (booking_pnr, from_status, to_status, actor_type, actor_id, message)
         VALUES (?, NULL, 'HELD', ?, ?, 'Booking created')`,
      ).run(reference, user ? 'customer' : 'guest', user?.id ?? null);

      return reference;
    }),
  );
}

function seatIdsForBooking(pnr) {
  return getDatabase()
    .prepare('SELECT seat_id FROM booking_seats WHERE booking_pnr = ?')
    .all(pnr)
    .map((row) => row.seat_id);
}

/** Rejects edits to a booking that is no longer a fresh hold. */
export function requireBookingEditable(pnr) {
  const booking = findBookingByPnr(pnr);
  if (!booking) throw new AppError(ErrorCode.BOOKING_NOT_FOUND, `Booking not found: ${pnr}`);
  if (booking.status !== BookingStatus.HELD) {
    throw new AppError(ErrorCode.INVALID_STATE_TRANSITION, 'This booking can no longer be changed');
  }
  if (booking.expires_at && Date.parse(booking.expires_at) < Date.now()) {
    throw new AppError(ErrorCode.BOOKING_EXPIRED, 'This booking has expired');
  }
  return booking;
}

/**
 * Attaches seats to a held booking.
 *
 * One seat per seated passenger: infants travel on a lap and occupy no seat, so
 * the selection count is compared against non-infant passengers.
 */
export function selectSeats(pnr, selections, { env } = {}) {
  const booking = requireBookingEditable(pnr);
  const parsed = assertValid(validateSeatSelections(selections));

  const passengers = getDatabase()
    .prepare('SELECT id, sequence, type FROM passengers WHERE booking_pnr = ? ORDER BY sequence ASC')
    .all(booking.pnr);

  const seated = passengers.filter((passenger) => passenger.type !== PassengerType.INFANT);
  if (parsed.length !== seated.length) {
    throw new AppError(
      ErrorCode.SEAT_COUNT_MISMATCH,
      `Select exactly ${seated.length} seat(s) for this booking`,
    );
  }

  const segments = getDatabase()
    .prepare('SELECT id, flight_id FROM booking_segments WHERE booking_pnr = ? ORDER BY sequence ASC')
    .all(booking.pnr);
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));

  const bySegment = new Map();
  let surchargeTotal = 0;

  for (const selection of parsed) {
    const segment = segmentById.get(selection.segmentId);
    if (!segment) throw new AppError(ErrorCode.SEAT_NOT_FOUND, 'Unknown segment for this booking');
    if (!bySegment.has(selection.segmentId)) bySegment.set(selection.segmentId, []);
    bySegment.get(selection.segmentId).push(selection);
  }

  for (const [segmentId, group] of bySegment) {
    const segment = segmentById.get(segmentId);
    const result = holdSeats({
      flightId: segment.flight_id,
      seatIds: group.map((selection) => selection.seatId),
      holdMinutes: DEFAULT_HOLD_MINUTES,
    });
    surchargeTotal += result.surchargeTotal;
  }

  withWriteRetry(() =>
    inTransaction((db) => {
      db.prepare('DELETE FROM booking_seats WHERE booking_pnr = ?').run(booking.pnr);

      const insert = db.prepare(
        `INSERT INTO booking_seats (id, booking_pnr, segment_id, passenger_id, seat_id)
         VALUES (?, ?, ?, ?, ?)`,
      );

      for (const selection of parsed) {
        const passenger = passengers.find((entry) => entry.sequence === selection.passengerIndex);
        if (!passenger) {
          throw AppError.validation(`No passenger at index ${selection.passengerIndex}`);
        }
        insert.run(crypto.randomUUID(), booking.pnr, selection.segmentId, passenger.id, selection.seatId);
      }
    }),
  );

  return { selected: parsed.length, surchargeTotal };
}

/**
 * The only writer of `bookings.status`.
 *
 * `privileged` widens the legal transition graph for staff, and seat side effects
 * are applied on the same transaction so a booking and its seats cannot disagree.
 */
export function transitionBooking(pnr, next, options = {}) {  const {
    actorType = 'system',
    actorId = null,
    privileged = false,
    message = null,
    metadata = null,
  } = options;

  return withWriteRetry(() =>
    inTransaction((db) => {
      const booking = db.prepare('SELECT pnr, status FROM bookings WHERE pnr = ?').get(pnr);
      if (!booking) throw new AppError(ErrorCode.BOOKING_NOT_FOUND, `Booking not found: ${pnr}`);

      const previous = booking.status;
      const guard = guardBookingTransition(previous, next, { privileged });
      if (!guard.ok) {
        throw new AppError(guard.code ?? ErrorCode.INVALID_STATE_TRANSITION, guard.message);
      }

      const seatIds = db
        .prepare('SELECT seat_id FROM booking_seats WHERE booking_pnr = ?')
        .all(pnr)
        .map((row) => row.seat_id);

      const now = new Date();
      const sets = ['status = ?', "updated_at = datetime('now')"];
      const values = [next];
      const holdExpiresAt = new Date(now.getTime() + DEFAULT_HOLD_MINUTES * 60_000).toISOString();

      if (next === BookingStatus.CONFIRMED) {
        sets.push('confirmed_at = ?');
        values.push(now.toISOString());
      }
      if (next === BookingStatus.TICKETED) {
        sets.push('ticketed_at = ?');
        values.push(now.toISOString());
      }
      if (next === BookingStatus.CANCELLED) {
        sets.push('cancelled_at = ?');
        values.push(now.toISOString());
      }
      if (next === BookingStatus.HELD) {
        sets.push('expires_at = ?');
        values.push(holdExpiresAt);
      }
      if (releasesSeats(next)) {
        sets.push('expires_at = NULL');
      }

      db.prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE pnr = ?`).run(...values, pnr);

      db.prepare(
        `INSERT INTO booking_events (booking_pnr, from_status, to_status, actor_type, actor_id, message, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(pnr, previous, next, actorType, actorId, message, metadata ? JSON.stringify(metadata) : null);

      if (seatIds.length > 0) {
        const placeholders = seatIds.map(() => '?').join(', ');
        if (releasesSeats(next)) {
          db.prepare(
            `UPDATE seats SET status = 'AVAILABLE', hold_expires_at = NULL
             WHERE id IN (${placeholders}) AND status IN ('HELD', 'BOOKED')`,
          ).run(...seatIds);
        } else if (next === BookingStatus.CONFIRMED) {
          db.prepare(
            `UPDATE seats SET status = 'BOOKED', hold_expires_at = NULL
             WHERE id IN (${placeholders}) AND status = 'HELD'`,
          ).run(...seatIds);
        }
      }

      if (requiresTicketVoid(next) && requiresRefund(previous)) {
        db.prepare(
          `UPDATE tickets SET status = 'VOIDED', voided_at = ?
           WHERE booking_pnr = ? AND status IN ('ISSUED', 'PENDING')`,
        ).run(now.toISOString(), pnr);
      }
    }),
  );
}

export function cancelBooking(pnr, { user, reason } = {}) {
  return transitionBooking(pnr, BookingStatus.CANCELLED, {
    actorType: user ? 'customer' : 'system',
    actorId: user?.id ?? null,
    privileged: isPrivileged(user),
    message: reason ?? null,
  });
}

export function isPrivileged(user) {
  return user?.role === UserRole.ADMIN || user?.role === UserRole.AGENT;
}

export function updateBookingContact(pnr, update) {
  const booking = findBookingByPnr(pnr);
  if (!booking) throw new AppError(ErrorCode.BOOKING_NOT_FOUND, `Booking not found: ${pnr}`);

  if ([BookingStatus.CANCELLED, BookingStatus.EXPIRED].includes(booking.status)) {
    throw new AppError(
      ErrorCode.INVALID_STATE_TRANSITION,
      'This booking can no longer be edited',
    );
  }

  const fields = Object.entries(update).filter(([, value]) => value !== undefined);
  if (fields.length === 0) throw AppError.validation('No changes to save');

  const columns = { contactPhone: 'contact_phone', contactEmail: 'contact_email' };
  const mapping = {
    contactPhone: 'contact_phone',
    contactEmail: 'contact_email',
    emergencyContactName: 'emergency_contact_name',
    emergencyContactPhone: 'emergency_contact_phone',
    homeAddress: 'home_address',
  };

  const sets = fields.map(([key]) => `${mapping[key] ?? columns[key]} = ?`);
  sets.push("updated_at = datetime('now')");

  return withWriteRetry(() =>
    inTransaction((db) => {
      db.prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE pnr = ?`).run(
        ...fields.map(([, value]) => value),
        pnr,
      );
      db.prepare(
        `INSERT INTO booking_events (booking_pnr, from_status, to_status, actor_type, actor_id, message)
         VALUES (?, ?, ?, 'customer', ?, ?)`,
      ).run(
        pnr,
        booking.status,
        booking.status,
        booking.user_id,
        `Contact details updated: ${fields.map(([key]) => key).join(', ')}`,
      );
    }),
  );
}

/**
 * Resolves a flight with its airline, airports and the segments's own fare.
 *
 * Written locally rather than imported from the search service because that module
 * already depends on this one; a shared import would close the cycle.
 */
function getFlightDetail(flightId, fareId) {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM flights WHERE id = ?').get(flightId);
  if (!row) return null;

  const airline = db.prepare('SELECT * FROM airlines WHERE id = ?').get(row.airline_id);

  const airport = (id) => {
    const airportRow = db.prepare('SELECT * FROM airports WHERE id = ?').get(id);
    if (!airportRow) return null;
    return {
      iataCode: airportRow.iata_code,
      name: airportRow.name,
      city: airportRow.city,
      country: airportRow.country,
      timezone: airportRow.timezone,
    };
  };

  const fareRow = fareId
    ? db.prepare('SELECT * FROM fares WHERE id = ?').get(fareId)
    : null;

  return {
    id: row.id,
    flightNumber: row.flight_number,
    departureAt: row.departure_at,
    arrivalAt: row.arrival_at,
    durationMinutes: row.duration_minutes,
    status: row.status,
    airline: airline
      ? { iataCode: airline.iata_code, name: airline.name, logoUrl: airline.logo_url }
      : { iataCode: '??', name: 'Unknown', logoUrl: null },
    origin: airport(row.origin_id),
    destination: airport(row.destination_id),
    ...(fareRow
      ? {
          fare: {
            id: fareRow.id,
            basePrice: fareRow.base_price,
            total: fareRow.base_price + fareRow.taxes + fareRow.fees,
            currency: fareRow.currency,
          },
        }
      : {}),
  };
}

/** Booking with segments, passengers, seats and tickets, shaped for the client. */
export function getBookingDetail(pnr) {
  const row = findBookingByPnr(pnr);
  if (!row) return null;

  const booking = mapBooking(row);

  const segments = getDatabase()
    .prepare('SELECT * FROM booking_segments WHERE booking_pnr = ? ORDER BY sequence ASC')
    .all(row.pnr)
    .map((segment) => ({
      id: segment.id,
      sequence: segment.sequence,
      flightId: segment.flight_id,
      fareId: segment.fare_id,
      baseFare: segment.base_fare,
      taxes: segment.taxes,
      fees: segment.fees,
      // The client renders a route line per segment, so the flight and fare are
      // resolved here rather than costing a second round trip.
      flight: getFlightDetail(segment.flight_id, segment.fare_id),
      assignedSeats: getDatabase()
        .prepare(
          `SELECT s.* FROM booking_seats bs JOIN seats s ON s.id = bs.seat_id
           WHERE bs.segment_id = ? ORDER BY s.seat_number ASC`,
        )
        .all(segment.id)
        .map((seat) => ({ id: seat.id, seatNumber: seat.seat_number })),
    }));

  const passengers = getDatabase()
    .prepare('SELECT * FROM passengers WHERE booking_pnr = ? ORDER BY sequence ASC')
    .all(row.pnr)
    .map(mapPassenger);

  const tickets = getDatabase()
    .prepare('SELECT * FROM tickets WHERE booking_pnr = ?')
    .all(row.pnr)
    .map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticket_number,
      status: ticket.status,
      segmentId: ticket.segment_id,
      passengerId: ticket.passenger_id,
      issuedAt: ticket.issued_at,
      qrPayload: ticket.qr_payload,
    }));

  const payments = getDatabase()
    .prepare('SELECT * FROM payments WHERE booking_pnr = ? ORDER BY created_at DESC')
    .all(row.pnr)
    .map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      cardSummary: payment.card_summary,
      failureCode: payment.failure_code,
      createdAt: payment.created_at,
    }));

  return { ...booking, segments, passengers, tickets, payments };
}

/**
 * The append-only audit trail for a booking, in the order it happened.
 *
 * This is what makes a disputed booking arguable: every status change and contact
 * edit is recorded with its actor.
 */
export function getBookingEvents(pnr) {
  return getDatabase()
    .prepare('SELECT * FROM booking_events WHERE booking_pnr = ? ORDER BY id ASC')
    .all(String(pnr).toUpperCase())
    .map((row) => ({
      id: row.id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      actorType: row.actor_type,
      message: row.message,
      createdAt: row.created_at,
    }));
}

export function listBookingsForUser(userId, status) {  const sql = status
    ? 'SELECT pnr FROM bookings WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 50'
    : 'SELECT pnr FROM bookings WHERE user_id = ? ORDER BY created_at DESC LIMIT 50';
  const statement = getDatabase().prepare(sql);
  const rows = status ? statement.all(userId, status) : statement.all(userId);
  return rows.map((row) => getBookingDetail(row.pnr));
}

export { seatIdsForBooking, DEFAULT_HOLD_MINUTES };
