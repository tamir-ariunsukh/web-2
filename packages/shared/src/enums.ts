/**
 * Domain enumerations shared between the API, web client and worker.
 * Kept as `as const` objects so they can be consumed both as values and as
 * Zod `z.enum()` inputs without duplicating the string literals.
 */

export const CabinClass = {
  ECONOMY: 'ECONOMY',
  PREMIUM_ECONOMY: 'PREMIUM_ECONOMY',
  BUSINESS: 'BUSINESS',
  FIRST: 'FIRST',
} as const;
export type CabinClass = (typeof CabinClass)[keyof typeof CabinClass];

export const BookingStatus = {
  /** Seats reserved, awaiting passenger details. Auto-expires. */
  HELD: 'HELD',
  /** Passenger details complete, awaiting payment. */
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  /** Payment captured but tickets not yet issued by the airline. */
  CONFIRMED: 'CONFIRMED',
  /** Tickets issued; the booking is final. */
  TICKETED: 'TICKETED',
  /** Passenger checked in; boarding passes available. */
  CHECKED_IN: 'CHECKED_IN',
  /** Hold or payment window elapsed without completion. */
  EXPIRED: 'EXPIRED',
  /** Cancelled by the user or an agent. */
  CANCELLED: 'CANCELLED',
  /** Payment failed and retries are exhausted. */
  PAYMENT_FAILED: 'PAYMENT_FAILED',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const PaymentStatus = {
  REQUIRES_ACTION: 'REQUIRES_ACTION',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  /** Money returned to the customer after a cancellation or failure. */
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethod = {
  CARD: 'CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  WALLET: 'WALLET',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PassengerType = {
  ADULT: 'ADULT',
  CHILD: 'CHILD',
  INFANT: 'INFANT',
} as const;
export type PassengerType = (typeof PassengerType)[keyof typeof PassengerType];

export const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  UNSPECIFIED: 'UNSPECIFIED',
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];

export const SeatStatus = {
  AVAILABLE: 'AVAILABLE',
  /** Temporarily locked by an in-progress booking. */
  HELD: 'HELD',
  BOOKED: 'BOOKED',
  /** Not sellable: crew rest, broken, exit-row restriction. */
  BLOCKED: 'BLOCKED',
} as const;
export type SeatStatus = (typeof SeatStatus)[keyof typeof SeatStatus];

export const TicketStatus = {
  PENDING: 'PENDING',
  ISSUED: 'ISSUED',
  VOIDED: 'VOIDED',
  REFUNDED: 'REFUNDED',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  /** Can create and modify bookings on behalf of customers. */
  AGENT: 'AGENT',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const FlightStatus = {
  SCHEDULED: 'SCHEDULED',
  DELAYED: 'DELAYED',
  DEPARTED: 'DEPARTED',
  ARRIVED: 'ARRIVED',
  CANCELLED: 'CANCELLED',
} as const;
export type FlightStatus = (typeof FlightStatus)[keyof typeof FlightStatus];

export const RefundStatus = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
} as const;
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];
