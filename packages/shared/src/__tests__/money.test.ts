import { describe, expect, it } from 'vitest';

import {
  allocateDiscount,
  applyPercentageDiscount,
  computeTotal,
  formatMoney,
  minorUnitExponent,
  toDecimal,
  toMinorUnits,
} from '../money.js';

describe('minor unit conversion', () => {
  it('uses two decimals by default', () => {
    expect(minorUnitExponent('USD')).toBe(2);
    expect(toMinorUnits(123.45, 'USD')).toBe(12345);
    expect(toDecimal(12345, 'USD')).toBe(123.45);
  });

  it('handles zero-decimal currencies', () => {
    expect(minorUnitExponent('JPY')).toBe(0);
    expect(toMinorUnits(1200, 'JPY')).toBe(1200);
    expect(toDecimal(1200, 'JPY')).toBe(1200);
  });

  it('handles three-decimal currencies', () => {
    expect(minorUnitExponent('KWD')).toBe(3);
    expect(toMinorUnits(1.234, 'KWD')).toBe(1234);
  });

  it('rounds half up rather than truncating', () => {
    expect(toMinorUnits(10.005, 'USD')).toBe(1001);
    expect(toMinorUnits(10.004, 'USD')).toBe(1000);
  });

  it('formats with the currency exponent', () => {
    expect(formatMoney(123450, 'USD', 'en-US')).toBe('$1,234.50');
    expect(formatMoney(1500, 'JPY', 'en-US')).toBe('¥1,500');
  });
});

describe('price breakdown', () => {
  it('sums parts into a total', () => {
    const result = computeTotal({
      baseFare: 100_000,
      taxes: 12_000,
      fees: 3_000,
      discount: 5_000,
    });
    expect(result.total).toBe(110_000);
  });

  it('clamps a discount larger than the fare at zero', () => {
    const result = computeTotal({
      baseFare: 1000,
      taxes: 0,
      fees: 0,
      discount: 5000,
    });
    expect(result.total).toBe(0);
  });
});

describe('discount allocation', () => {
  it('never loses or invents minor units', () => {
    const amounts = [333, 333, 334];
    const allocation = allocateDiscount(amounts, 100);
    expect(allocation.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('distributes proportionally for divide-by-three cases', () => {
    const allocation = allocateDiscount([100, 100, 100], 10);
    expect(allocation.reduce((sum, value) => sum + value, 0)).toBe(10);
  });

  it('caps the discount at the basket total', () => {
    const allocation = allocateDiscount([100, 100], 1000);
    expect(allocation.reduce((sum, value) => sum + value, 0)).toBe(200);
  });

  it('returns zeros for an empty basket or no discount', () => {
    expect(allocateDiscount([], 100)).toEqual([]);
    expect(allocateDiscount([100, 200], 0)).toEqual([0, 0]);
  });

  it('skips zero-priced lines when placing the remainder', () => {
    const allocation = allocateDiscount([0, 1000], 7);
    expect(allocation[0]).toBe(0);
    expect(allocation.reduce((sum, value) => sum + value, 0)).toBe(7);
  });

  it('clamps percentage discounts to the 0-100 range', () => {
    expect(applyPercentageDiscount(10_000, 10)).toBe(9000);
    expect(applyPercentageDiscount(10_000, 150)).toBe(0);
    expect(applyPercentageDiscount(10_000, -5)).toBe(10_000);
  });
});
