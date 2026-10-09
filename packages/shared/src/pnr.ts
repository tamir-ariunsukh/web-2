/**
 * Passenger Name Record generation and parsing.
 *
 * PNRs are 6 characters from a reduced alphabet that omits visually ambiguous
 * glyphs (0/O, 1/I/L) because agents and customers read them aloud. Generation
 * uses `crypto.getRandomValues` so PNRs are not predictable from one another.
 */

/** Reduced alphabet: no 0, O, 1, I, L. */
const PNR_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PNR_LENGTH = 6;
const PNR_PATTERN = /^[A-Z0-9]{6}$/;

export function generatePnr(): string {
  const bytes = new Uint8Array(PNR_LENGTH);
  crypto.getRandomValues(bytes);

  let pnr = '';
  for (const byte of bytes) {
    // `byte % length` introduces negligible modulo bias given 256 % 31 == 8,
    // and the resulting PNR space (31^6 ≈ 8.9e8) is far larger than needed.
    pnr += PNR_ALPHABET[byte % PNR_ALPHABET.length];
  }
  return pnr;
}

export function isValidPnr(value: string): boolean {
  return PNR_PATTERN.test(value.trim().toUpperCase());
}

export function normalisePnr(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Formats a PNR for display in groups of three, e.g. `ABC-DEF`.
 */
export function formatPnr(pnr: string): string {
  const normalised = normalisePnr(pnr);
  return `${normalised.slice(0, 3)}-${normalised.slice(3)}`;
}

/**
 * Airline accounting ticket number: a 3-digit airline code plus a 9-digit
 * serial, completed by a Luhn check digit for 13 characters total.
 */
export function generateTicketNumber(
  airlineNumericCode: string,
  serial: number,
): string {
  if (!/^\d{3}$/.test(airlineNumericCode)) {
    throw new Error('Airline numeric code must be exactly 3 digits');
  }
  if (!Number.isInteger(serial) || serial < 0 || serial > 999_999_999) {
    throw new Error('Ticket serial must be a 9-digit integer');
  }

  const base = `${airlineNumericCode}${serial.toString().padStart(9, '0')}`;
  return `${base}${luhnCheckDigit(base)}`;
}

function luhnCheckDigit(digits: string): string {
  let sum = 0;
  // The check digit is appended, so parity flips: double every second digit
  // counting from the right of the *base* string.
  for (let i = digits.length - 1, position = 1; i >= 0; i -= 1, position += 1) {
    const digit = digits.charCodeAt(i) - 48;
    const value = position % 2 === 1 ? digit * 2 : digit;
    sum += value > 9 ? value - 9 : value;
  }
  return String((10 - (sum % 10)) % 10);
}

export function isValidTicketNumber(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const base = value.slice(0, 12);
  return luhnCheckDigit(base) === value[12];
}
