import { z } from 'zod';

import { CabinClass, Gender, PassengerType } from './enums.js';

// ─────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────

/** IATA airport/city code: exactly three uppercase letters. */
export const iataCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Must be a 3-letter IATA code');

export const emailSchema = z.string().trim().toLowerCase().email('Invalid email address').max(254);

/**
 * E.164-ish phone number. Accepts an optional leading `+`, spaces, dashes and
 * parentheses, then normalises to digits-only with an optional leading `+`.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Phone number is too short')
  .max(20, 'Phone number is too long')
  .regex(/^\+?[\d\s\-().]+$/, 'Phone number contains invalid characters')
  .transform((value) => {
    const digits = value.replace(/[^\d]/g, '');
    return value.startsWith('+') ? `+${digits}` : digits;
  });

/** ISO-4217 currency code, uppercase. */
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Must be a 3-letter currency code');

/** Monetary amount in minor units (cents) — never a float. */
export const moneySchema = z.number().int().nonnegative();

/** Calendar date without a time zone, `YYYY-MM-DD`. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Invalid calendar date');

/** Airport-local time, `HH:mm`. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');

export const uuidSchema = z.string().uuid();

export const pnrSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, 'PNR must be 6 alphanumeric characters');

/** Passport / national ID number. Kept permissive to accommodate foreign formats. */
export const passportNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(5, 'Passport number is too short')
  .max(20, 'Passport number is too long')
  .regex(/^[A-Z0-9]+$/, 'Passport number must be alphanumeric');

export const cabinClassSchema = z.enum([
  CabinClass.ECONOMY,
  CabinClass.PREMIUM_ECONOMY,
  CabinClass.BUSINESS,
  CabinClass.FIRST,
]);

export const passengerTypeSchema = z.enum([
  PassengerType.ADULT,
  PassengerType.CHILD,
  PassengerType.INFANT,
]);

export const genderSchema = z.enum([Gender.MALE, Gender.FEMALE, Gender.UNSPECIFIED]);

// ─────────────────────────────────────────────────────────────
// Flight search
// ─────────────────────────────────────────────────────────────

export const passengerCountSchema = z
  .object({
    adults: z.number().int().min(1, 'At least one adult is required').max(9),
    children: z.number().int().min(0).max(8).default(0),
    /** Infants travel on an adult's lap and occupy no seat. */
    infants: z.number().int().min(0).max(4).default(0),
  })
  .refine((value) => value.infants <= value.adults, {
    message: 'Each infant must be accompanied by an adult',
    path: ['infants'],
  })
  .refine((value) => value.adults + value.children <= 9, {
    message: 'A booking may contain at most 9 seated passengers',
    path: ['children'],
  });

export type PassengerCount = z.infer<typeof passengerCountSchema>;

export const flightFiltersSchema = z.object({
  maxStops: z.number().int().min(0).max(3).optional(),
  airlines: z.array(iataCodeSchema).max(20).optional(),
  maxPrice: moneySchema.optional(),
  minPrice: moneySchema.optional(),
  departAfter: timeOfDaySchema.optional(),
  departBefore: timeOfDaySchema.optional(),
  arriveAfter: timeOfDaySchema.optional(),
  arriveBefore: timeOfDaySchema.optional(),
  maxDurationMinutes: z.number().int().positive().optional(),
  refundableOnly: z.boolean().default(false),
});

export const FlightSort = {
  PRICE_ASC: 'PRICE_ASC',
  PRICE_DESC: 'PRICE_DESC',
  DURATION_ASC: 'DURATION_ASC',
  DEPARTURE_ASC: 'DEPARTURE_ASC',
  ARRIVAL_ASC: 'ARRIVAL_ASC',
  BEST: 'BEST',
} as const;
export type FlightSort = (typeof FlightSort)[keyof typeof FlightSort];

export const flightSortSchema = z.enum([
  FlightSort.PRICE_ASC,
  FlightSort.PRICE_DESC,
  FlightSort.DURATION_ASC,
  FlightSort.DEPARTURE_ASC,
  FlightSort.ARRIVAL_ASC,
  FlightSort.BEST,
]);

export const flightSearchSchema = z
  .object({
    origin: iataCodeSchema,
    destination: iataCodeSchema,
    departDate: dateOnlySchema,
    returnDate: dateOnlySchema.optional(),
    passengers: passengerCountSchema,
    cabin: cabinClassSchema.default(CabinClass.ECONOMY),
    filters: flightFiltersSchema.optional(),
    sort: flightSortSchema.default(FlightSort.BEST),
    cursor: z.string().max(512).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .refine((value) => value.origin !== value.destination, {
    message: 'Origin and destination must differ',
    path: ['destination'],
  })
  .refine(
    (value) =>
      value.returnDate === undefined || value.returnDate >= value.departDate,
    { message: 'Return date cannot precede departure', path: ['returnDate'] },
  );

export type FlightSearchInput = z.infer<typeof flightSearchSchema>;

// ─────────────────────────────────────────────────────────────
// Booking
// ─────────────────────────────────────────────────────────────

/** Ages are validated against the departure date at the API layer. */
export const passengerSchema = z
  .object({
    type: passengerTypeSchema,
    firstName: z.string().trim().min(1).max(64),
    lastName: z.string().trim().min(1).max(64),
    middleName: z.string().trim().max(64).optional(),
    dateOfBirth: dateOnlySchema,
    gender: genderSchema.default(Gender.UNSPECIFIED),
    nationality: iataCodeSchema.optional(),
    passportNumber: passportNumberSchema.optional(),
    passportExpiry: dateOnlySchema.optional(),
    passportIssuingCountry: iataCodeSchema.optional(),
  })
  .superRefine((value, ctx) => {
    // Passport fields are all-or-nothing for international segments.
    const provided = [
      value.passportNumber,
      value.passportExpiry,
      value.passportIssuingCountry,
    ].filter((field) => field !== undefined).length;

    if (provided !== 0 && provided !== 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Passport number, expiry and issuing country must be provided together',
        path: ['passportNumber'],
      });
    }

    if (value.passportExpiry !== undefined && value.passportExpiry <= value.dateOfBirth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passport expiry must be after the date of birth',
        path: ['passportExpiry'],
      });
    }
  });

export type PassengerInput = z.infer<typeof passengerSchema>;

export const seatSelectionSchema = z.object({
  passengerIndex: z.number().int().min(0),
  segmentId: uuidSchema,
  seatId: uuidSchema,
});

export type SeatSelectionInput = z.infer<typeof seatSelectionSchema>;

export const createBookingSchema = z.object({
  /** One entry per itinerary segment, in travel order. */
  segments: z
    .array(
      z.object({
        flightId: uuidSchema,
        fareId: uuidSchema,
      }),
    )
    .min(1)
    .max(8, 'An itinerary may contain at most 8 segments'),
  contactEmail: emailSchema,
  contactPhone: phoneSchema,
  passengers: z.array(passengerSchema).min(1).max(9),
  promoCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(32)
    .regex(/^[A-Z0-9_-]+$/, 'Promo code contains invalid characters')
    .optional(),
  /** Client-generated key so a retried request cannot create a second booking. */
  idempotencyKey: z.string().min(16).max(128).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const updatePassengersSchema = z.object({
  bookingId: uuidSchema,
  passengers: z.array(passengerSchema).min(1).max(9),
});

// ─────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((value) => /[a-z]/.test(value), 'Password must contain a lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Password must contain an uppercase letter')
  .refine((value) => /\d/.test(value), 'Password must contain a digit')
  .refine(
    (value) => /[^A-Za-z0-9]/.test(value),
    'Password must contain a symbol',
  );

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(64),
  lastName: z.string().trim().min(1).max(64),
  phone: phoneSchema.optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─────────────────────────────────────────────────────────────
// Payment
// ─────────────────────────────────────────────────────────────

export const MockPaymentOutcome = {
  SUCCESS: 'SUCCESS',
  DECLINE: 'DECLINE',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  TIMEOUT: 'TIMEOUT',
} as const;
export type MockPaymentOutcome = (typeof MockPaymentOutcome)[keyof typeof MockPaymentOutcome];

export const mockPaymentOutcomeSchema = z.enum([
  MockPaymentOutcome.SUCCESS,
  MockPaymentOutcome.DECLINE,
  MockPaymentOutcome.INSUFFICIENT_FUNDS,
  MockPaymentOutcome.TIMEOUT,
]);

export const createPaymentIntentSchema = z.object({
  bookingId: uuidSchema,
  idempotencyKey: z.string().min(16).max(128).optional(),
});

export const refundRequestSchema = z.object({
  bookingId: uuidSchema,
  reason: z.string().trim().max(500).optional(),
  /** Partial refund in minor units; omitted means full refund. */
  amount: moneySchema.optional(),
});
