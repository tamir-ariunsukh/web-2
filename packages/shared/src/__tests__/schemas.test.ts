import { describe, expect, it } from 'vitest';

import { flightSearchSchema, passengerCountSchema, passengerSchema, createBookingSchema } from '../schemas.js';

const ADULT = {
  type: 'ADULT' as const,
  firstName: 'Bat',
  lastName: 'Erdene',
  dateOfBirth: '1990-05-14',
};

describe('passenger count', () => {
  it('accepts a typical family', () => {
    const result = passengerCountSchema.safeParse({ adults: 2, children: 2, infants: 1 });
    expect(result.success).toBe(true);
  });

  it('requires at least one adult', () => {
    expect(passengerCountSchema.safeParse({ adults: 0 }).success).toBe(false);
  });

  it('requires each infant to have an adult', () => {
    const result = passengerCountSchema.safeParse({ adults: 1, infants: 2 });
    expect(result.success).toBe(false);
  });

  it('caps seated passengers at 9', () => {
    expect(passengerCountSchema.safeParse({ adults: 8, children: 2 }).success).toBe(false);
    expect(passengerCountSchema.safeParse({ adults: 9, children: 0 }).success).toBe(true);
  });
});

describe('flight search', () => {
  const base = {
    origin: 'uln',
    destination: 'sel',
    departDate: '2026-03-01',
    passengers: { adults: 1 },
  };

  it('normalises the IATA codes to uppercase', () => {
    const result = flightSearchSchema.parse(base);
    expect(result.origin).toBe('ULN');
    expect(result.destination).toBe('SEL');
  });

  it('rejects a same-airport search', () => {
    const result = flightSearchSchema.safeParse({ ...base, destination: 'ULN' });
    expect(result.success).toBe(false);
  });

  it('rejects a return date before departure', () => {
    const result = flightSearchSchema.safeParse({
      ...base,
      returnDate: '2026-02-01',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a return date on the same day', () => {
    const result = flightSearchSchema.safeParse({ ...base, returnDate: '2026-03-01' });
    expect(result.success).toBe(true);
  });

  it('applies defaults for cabin, sort and limit', () => {
    const result = flightSearchSchema.parse(base);
    expect(result.cabin).toBe('ECONOMY');
    expect(result.sort).toBe('BEST');
    expect(result.limit).toBe(20);
  });

  it('rejects a page size above the cap', () => {
    expect(flightSearchSchema.safeParse({ ...base, limit: 500 }).success).toBe(false);
  });
});

describe('passenger details', () => {
  it('accepts a domestic passenger without a passport', () => {
    expect(passengerSchema.safeParse(ADULT).success).toBe(true);
  });

  it('accepts a complete passport block', () => {
    const result = passengerSchema.safeParse({
      ...ADULT,
      passportNumber: 'E1234567',
      passportExpiry: '2030-01-01',
      passportIssuingCountry: 'MNG',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a partial passport block', () => {
    const result = passengerSchema.safeParse({ ...ADULT, passportNumber: 'E1234567' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('must be provided together');
    }
  });

  it('rejects a passport expiring before the passenger was born', () => {
    const result = passengerSchema.safeParse({
      ...ADULT,
      passportNumber: 'E1234567',
      passportExpiry: '1980-01-01',
      passportIssuingCountry: 'MNG',
    });
    expect(result.success).toBe(false);
  });
});

describe('booking creation', () => {
  const segment = {
    flightId: '00000000-0000-4000-8000-000000000001',
    fareId: '00000000-0000-4000-8000-000000000002',
  };

  it('accepts a single-passenger booking', () => {
    const result = createBookingSchema.safeParse({
      segments: [segment],
      contactEmail: 'Bat@Example.COM',
      contactPhone: '+976 9911-2233',
      passengers: [ADULT],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contactEmail).toBe('bat@example.com');
      expect(result.data.contactPhone).toBe('+97699112233');
    }
  });

  it('rejects an empty segment list', () => {
    const result = createBookingSchema.safeParse({
      segments: [],
      contactEmail: 'a@b.com',
      contactPhone: '+97699112233',
      passengers: [ADULT],
    });
    expect(result.success).toBe(false);
  });

  it('normalises the promo code', () => {
    const result = createBookingSchema.safeParse({
      segments: [segment],
      contactEmail: 'a@b.com',
      contactPhone: '+97699112233',
      passengers: [ADULT],
      promoCode: 'summer-25',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.promoCode).toBe('SUMMER-25');
    }
  });

  it('rejects a short idempotency key', () => {
    const result = createBookingSchema.safeParse({
      segments: [segment],
      contactEmail: 'a@b.com',
      contactPhone: '+97699112233',
      passengers: [ADULT],
      idempotencyKey: 'short',
    });
    expect(result.success).toBe(false);
  });
});
