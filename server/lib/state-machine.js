import { BookingStatus, PaymentStatus } from './enums.js';
import { ErrorCode } from './errors.js';

/**
 * Booking lifecycle. This module is the single source of truth for which
 * transitions are legal, so a status can never be written by hand without
 * passing through {@link guardBookingTransition}.
 *
 * Flow:
 *   HELD -> PENDING_PAYMENT -> CONFIRMED -> TICKETED -> CHECKED_IN
 *                  \-> PAYMENT_FAILED          \-> CANCELLED
 */

/** Customer-initiated transitions. Deliberately minimal. */
const CUSTOMER_TRANSITIONS = {
  [BookingStatus.HELD]: [
    BookingStatus.PENDING_PAYMENT,
    BookingStatus.EXPIRED,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.PENDING_PAYMENT]: [
    BookingStatus.CONFIRMED,
    BookingStatus.PAYMENT_FAILED,
    BookingStatus.EXPIRED,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.CONFIRMED]: [BookingStatus.TICKETED, BookingStatus.CANCELLED],
  [BookingStatus.TICKETED]: [BookingStatus.CHECKED_IN, BookingStatus.CANCELLED],
  [BookingStatus.CHECKED_IN]: [],
  [BookingStatus.EXPIRED]: [],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.PAYMENT_FAILED]: [BookingStatus.PENDING_PAYMENT, BookingStatus.CANCELLED],
};

/**
 * Extra transitions available to ADMIN/AGENT: recovering a failed payment,
 * re-ticketing, and reopening an expired hold for a phone booking.
 */
const PRIVILEGED_EXTRA = {
  [BookingStatus.PAYMENT_FAILED]: [BookingStatus.CONFIRMED, BookingStatus.PENDING_PAYMENT],
  [BookingStatus.TICKETED]: [
    BookingStatus.CHECKED_IN,
    BookingStatus.CANCELLED,
    BookingStatus.CONFIRMED,
  ],
  [BookingStatus.EXPIRED]: [BookingStatus.HELD],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.CHECKED_IN]: [],
};

/** Terminal states never leave, for anyone. */
export const TERMINAL_BOOKING_STATUSES = [BookingStatus.CHECKED_IN, BookingStatus.CANCELLED];

/** States that still consume seat inventory. */
export const RESERVING_BOOKING_STATUSES = [
  BookingStatus.HELD,
  BookingStatus.PENDING_PAYMENT,
  BookingStatus.CONFIRMED,
  BookingStatus.TICKETED,
  BookingStatus.CHECKED_IN,
];

export function allowedBookingTransitions(from, context = {}) {
  const base = CUSTOMER_TRANSITIONS[from] ?? [];
  if (!context.privileged) return base;
  return Array.from(new Set([...base, ...(PRIVILEGED_EXTRA[from] ?? [])]));
}

export function canTransitionBooking(from, to, context = {}) {
  return allowedBookingTransitions(from, context).includes(to);
}

/**
 * Validates a booking transition and returns a domain code when illegal, rather
 * than throwing, so callers can shape the response.
 */
export function guardBookingTransition(from, to, context = {}) {
  if (from === to) {
    return {
      ok: false,
      code: ErrorCode.INVALID_STATE_TRANSITION,
      message: `Booking is already in status ${from}`,
    };
  }
  if (!canTransitionBooking(from, to, context)) {
    return {
      ok: false,
      code: ErrorCode.INVALID_STATE_TRANSITION,
      message: `Cannot transition booking from ${from} to ${to}`,
    };
  }
  return { ok: true };
}

const PAYMENT_TRANSITIONS = {
  [PaymentStatus.REQUIRES_ACTION]: [
    PaymentStatus.PROCESSING,
    PaymentStatus.SUCCEEDED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.PROCESSING]: [
    PaymentStatus.SUCCEEDED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.SUCCEEDED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.FAILED]: [PaymentStatus.REQUIRES_ACTION],
  [PaymentStatus.CANCELLED]: [],
  /** Terminal — a refund cannot be reversed; a new payment is required. */
  [PaymentStatus.REFUNDED]: [],
};

export function canTransitionPayment(from, to) {
  if (from === to) return true;
  return (PAYMENT_TRANSITIONS[from] ?? []).includes(to);
}

/** Payment statuses after which no further charge may be attempted. */
export const PAYMENT_SETTLED_STATUSES = [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED];

/** A booking still needs action from the customer in these states. */
export function isBookingActionable(status) {
  return (
    status === BookingStatus.HELD ||
    status === BookingStatus.PENDING_PAYMENT ||
    status === BookingStatus.PAYMENT_FAILED
  );
}

/** Seats must be released when moving into these states. */
export function releasesSeats(status) {
  return (
    status === BookingStatus.EXPIRED ||
    status === BookingStatus.CANCELLED ||
    status === BookingStatus.PAYMENT_FAILED
  );
}

/** Tickets must be voided when cancelling from a ticketed state. */
export function requiresTicketVoid(status) {
  return status === BookingStatus.TICKETED || status === BookingStatus.CHECKED_IN;
}

/** Refunds are owed when cancelling after payment settled. */
export function requiresRefund(status) {
  return status === BookingStatus.CONFIRMED || status === BookingStatus.TICKETED;
}
