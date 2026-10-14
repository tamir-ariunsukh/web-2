/** Domain enumerations shared by the server, the API and the browser bundle. */

export const CabinClass = {
  ECONOMY: 'ECONOMY',
  PREMIUM_ECONOMY: 'PREMIUM_ECONOMY',
  BUSINESS: 'BUSINESS',
  FIRST: 'FIRST',
};

export const CABIN_CLASSES = Object.values(CabinClass);

/** Order used when rendering a seat map, cheapest cabin last. */
export const CABIN_ORDER = [
  CabinClass.FIRST,
  CabinClass.BUSINESS,
  CabinClass.PREMIUM_ECONOMY,
  CabinClass.ECONOMY,
];

export const CABIN_LABELS = {
  FIRST: 'First',
  BUSINESS: 'Business',
  PREMIUM_ECONOMY: 'Premium Economy',
  ECONOMY: 'Economy',
};

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
};

export const PaymentStatus = {
  REQUIRES_ACTION: 'REQUIRES_ACTION',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  /** Money returned to the customer after a cancellation or failure. */
  REFUNDED: 'REFUNDED',
};

export const PaymentMethod = {
  CARD: 'CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  WALLET: 'WALLET',
};

export const PassengerType = {
  ADULT: 'ADULT',
  CHILD: 'CHILD',
  INFANT: 'INFANT',
};

export const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  UNSPECIFIED: 'UNSPECIFIED',
};

export const SeatStatus = {
  AVAILABLE: 'AVAILABLE',
  /** Temporarily locked by an in-progress booking. */
  HELD: 'HELD',
  BOOKED: 'BOOKED',
  /** Not sellable: crew rest, broken, exit-row restriction. */
  BLOCKED: 'BLOCKED',
};

export const SeatPosition = {
  WINDOW: 'WINDOW',
  MIDDLE: 'MIDDLE',
  AISLE: 'AISLE',
};

export const TicketStatus = {
  PENDING: 'PENDING',
  ISSUED: 'ISSUED',
  VOIDED: 'VOIDED',
  REFUNDED: 'REFUNDED',
};

export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  /** Can create and modify bookings on behalf of customers. */
  AGENT: 'AGENT',
  ADMIN: 'ADMIN',
};

export const FlightStatus = {
  SCHEDULED: 'SCHEDULED',
  DELAYED: 'DELAYED',
  DEPARTED: 'DEPARTED',
  ARRIVED: 'ARRIVED',
  CANCELLED: 'CANCELLED',
};

export const RefundStatus = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
};

export const ProductKind = {
  SEAT: 'SEAT',
  BAGGAGE: 'BAGGAGE',
  INSURANCE: 'INSURANCE',
  MEAL: 'MEAL',
  LOUNGE: 'LOUNGE',
  OTHER: 'OTHER',
};

export const MockPaymentOutcome = {
  SUCCESS: 'SUCCESS',
  DECLINE: 'DECLINE',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  TIMEOUT: 'TIMEOUT',
};
