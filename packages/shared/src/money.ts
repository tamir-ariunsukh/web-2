/**
 * Money handling. All amounts are integer minor units (cents, мөнгө) to avoid
 * binary floating-point drift. Currencies with zero decimal places (JPY, KRW,
 * MNT ticketing quirks) are handled explicitly.
 */

/** Currencies that have no minor unit. */
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'XAF', 'XOF']);

/** Currencies conventionally displayed with three decimals. */
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND']);

export function minorUnitExponent(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

/** Converts a decimal amount to integer minor units, rounding half-up. */
export function toMinorUnits(amount: number, currency: string): number {
  const exponent = minorUnitExponent(currency);
  const factor = 10 ** exponent;
  return Math.round((amount + Number.EPSILON) * factor);
}

/** Converts integer minor units back to a decimal amount. */
export function toDecimal(amount: number, currency: string): number {
  const factor = 10 ** minorUnitExponent(currency);
  return amount / factor;
}

/** Formats an amount for display, e.g. `1,234.50 USD`. */
export function formatMoney(
  amount: number,
  currency: string,
  locale = 'en-US',
): string {
  const exponent = minorUnitExponent(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(toDecimal(amount, currency));
}

export interface PriceBreakdown {
  readonly baseFare: number;
  readonly taxes: number;
  readonly fees: number;
  readonly discount: number;
  readonly total: number;
}

/** Sums a price breakdown, guaranteeing `total` equals its parts. */
export function computeTotal(breakdown: Omit<PriceBreakdown, 'total'>): PriceBreakdown {
  const total = breakdown.baseFare + breakdown.taxes + breakdown.fees - breakdown.discount;
  return { ...breakdown, total: Math.max(0, total) };
}

/**
 * Distributes a discount across priced line items without losing or inventing
 * minor units. The remainder is applied to the first line so the sum matches.
 */
export function allocateDiscount(amounts: readonly number[], discount: number): number[] {
  const total = amounts.reduce((sum, value) => sum + value, 0);
  if (total === 0 || discount <= 0) {
    return amounts.map(() => 0);
  }

  const capped = Math.min(discount, total);
  const allocation = amounts.map((value) =>
    value === 0 ? 0 : Math.floor((value / total) * capped),
  );
  const allocated = allocation.reduce((sum, value) => sum + value, 0);
  const remainder = capped - allocated;

  if (remainder > 0) {
    const index = amounts.findIndex((value) => value > 0);
    if (index >= 0) {
      allocation[index] = (allocation[index] ?? 0) + remainder;
    }
  }

  return allocation;
}

/** Percentage discount, rounded to minor units. */
export function applyPercentageDiscount(amount: number, percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  return amount - Math.round((amount * clamped) / 100);
}
