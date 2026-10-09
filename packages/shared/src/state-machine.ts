import { BookingStatus, PaymentStatus } from './enums.js';
import { ErrorCode, type ErrorCode as ErrorCodeType } from './error-codes.js';

/**
 * Booking lifecycle. This module is the single source of truth for which
 * transitions are legal; both the API and the worker import it, so a status can
 * never be written by hand without passing through {@link assertBookingTransition}.
 *
 * Flow:
 *   HELD → PENDING_PAYMENT → CONFIRMED → TICKETED → CHECKED_IN
 *                 ↘ PAYMENT_FAILED          ↘ CANCELLED
 */

export interface TransitionContext {
  /** True when the actor is an admin or agent, which widens the graph. */
  readonly privileged?: boolean;
}

type TransitionMap = Record<BookingStatus, readonly BookingStatus[]>;

/**
 * Customer-initiated transitions. Deliberately minimal: a customer may abandon a
 * hold, pay for a held booking, and cancel before ticketing.
 */
const CUSTOMER_TRANSITIONS: TransitionMap = {
  [BookingStatus.HELD]: [BookingStatus.PENDING_PAYMENT, BookingStatus.EXPIRED, BookingStatus.CANCELLED],
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
 * Additional transitions available to ADMIN/AGENT: recovering a failed payment,
 * re-ticketing, and reopening an expired hold for a phone booking.
 */
const PRIVILEGED_EXTRA: Partial<TransitionMap> = {
  [BookingStatus.PAYMENT_FAILED]: [BookingStatus.CONFIRMED, BookingStatus.PENDING_PAYMENT],
  [BookingStatus.TICKETED]: [BookingStatus.CHECKED_IN, BookingStatus.CANCELLED, BookingStatus.CONFIRMED],
  [BookingStatus.EXPIRED]: [BookingStatus.HELD],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.CHECKED_IN]: [],
};

/** Terminal states never leave, for anyone. */
export const TERMINAL_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.CHECKED_IN,
  BookingStatus.CANCELLED,
];

/** States that still consume seat inventory and must be released on expiry. */
export const RESERVING_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.HELD,
  BookingStatus.PENDING_PAYMENT,
  BookingStatus.CONFIRMED,
  BookingStatus.TICKETED,
  BookingStatus.CHECKED_IN,
];

export function allowedBookingTransitions(
  from: BookingStatus,
  context: TransitionContext = {},
): readonly BookingStatus[] {
  const base = CUSTOMER_TRANSITIONS[from];
  if (!context.privileged) {
    return base;
  }
  const extra = PRIVILEGED_EXTRA[from] ?? [];
  return Array.from(new Set([...base, ...extra]));
}

export function canTransitionBooking(
  from: BookingStatus,
  to: BookingStatus,
  context: TransitionContext = {},
): boolean {
  return allowedBookingTransitions(from, context).includes(to);
}

export interface TransitionGuardResult {
  readonly ok: boolean;
  readonly code?: ErrorCodeType;
  readonly message?: string;
}

/**
 * Validates a booking transition and returns a domain error code when illegal,
 * rather than throwing, so callers can shape the response.
 */
export function guardBookingTransition(
  from: BookingStatus,
  to: BookingStatus,
  context: TransitionContext = {},
): TransitionGuardResult {
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

export function assertBookingTransition(
  from: BookingStatus,
  to: BookingStatus,
  context: TransitionContext = {},
): void {
  const result = guardBookingTransition(from, to, context);
  if (!result.ok) {
    throw new Error(result.message ?? 'Invalid booking state transition');
  }
}

// ─────────────────────────────────────────────────────────────
// Payment lifecycle
// ─────────────────────────────────────────────────────────────

const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
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

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (from !== to && !canTransitionPayment(from, to)) {
    throw new Error(`Cannot transition payment from ${from} to ${to}`);
  }
}

/** Payment statuses after which no further charge may be attempted. */
export const PAYMENT_SETTLED_STATUSES: readonly PaymentStatus[] = [
  PaymentStatus.SUCCEEDED,
  PaymentStatus.REFUNDED,
];

// ─────────────────────────────────────────────────────────────
// Derived booking state
// ─────────────────────────────────────────────────────────────

/** A booking still needs action from the customer in these states. */
export function isBookingActionable(status: BookingStatus): boolean {
  return (
    status === BookingStatus.HELD ||
    status === BookingStatus.PENDING_PAYMENT ||
    status === BookingStatus.PAYMENT_FAILED
  );
}

/** Seats must be released when moving into these states. */
export function releasesSeats(status: BookingStatus): boolean {
  return (
    status === BookingStatus.EXPIRED ||
    status === BookingStatus.CANCELLED ||
    status === BookingStatus.PAYMENT_FAILED
  );
}

/** Tickets must be voided when cancelling from a ticketed state. */
export function requiresTicketVoid(status: BookingStatus): boolean {
  return status === BookingStatus.TICKETED || status === BookingStatus.CHECKED_IN;
}

/** Refunds are owed when cancelling after payment settled. */
export function requiresRefund(status: BookingStatus): boolean {
  return status === BookingStatus.CONFIRMED || status === BookingStatus.TICKETED;
}
