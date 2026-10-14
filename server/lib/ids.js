import { randomUUID, randomBytes } from 'node:crypto';

/** Identifier helpers. Every domain row uses a UUID primary key. */

export function newId() {
  return randomUUID();
}

/**
 * PNR generation: 6 characters from a reduced alphabet that omits visually
 * ambiguous glyphs (0/O, 1/I/L) because agents and customers read them aloud.
 */
const PNR_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PNR_LENGTH = 6;

export function generatePnr() {
  const bytes = randomBytes(PNR_LENGTH);
  let pnr = '';
  for (const byte of bytes) {
    // `byte % 31` introduces negligible modulo bias (256 % 31 == 8) and the
    // resulting space (31^6 ~ 8.9e8) is far larger than needed.
    pnr += PNR_ALPHABET[byte % PNR_ALPHABET.length];
  }
  return pnr;
}

export function isValidPnr(value) {
  return /^[A-Z0-9]{6}$/.test(String(value ?? '').trim().toUpperCase());
}

export function normalisePnr(value) {
  return String(value ?? '').trim().toUpperCase();
}

/** Formats a PNR for display in groups of three, e.g. `ABC-DEF`. */
export function formatPnr(pnr) {
  const normalised = normalisePnr(pnr);
  return `${normalised.slice(0, 3)}-${normalised.slice(3)}`;
}

/**
 * Airline accounting ticket number: a 3-digit airline code plus a 9-digit
 * serial, completed by a Luhn check digit for 13 characters total.
 */
export function generateTicketNumber(airlineNumericCode, serial) {
  if (!/^\d{3}$/.test(airlineNumericCode)) {
    throw new Error('Airline numeric code must be exactly 3 digits');
  }
  if (!Number.isInteger(serial) || serial < 0 || serial > 999_999_999) {
    throw new Error('Ticket serial must be a 9-digit integer');
  }
  const base = `${airlineNumericCode}${String(serial).padStart(9, '0')}`;
  return `${base}${luhnCheckDigit(base)}`;
}

function luhnCheckDigit(digits) {
  let sum = 0;
  // The check digit is appended, so parity flips: double every second digit
  // counting from the right of the base string.
  for (let i = digits.length - 1, position = 1; i >= 0; i -= 1, position += 1) {
    const digit = digits.charCodeAt(i) - 48;
    const value = position % 2 === 1 ? digit * 2 : digit;
    sum += value > 9 ? value - 9 : value;
  }
  return String((10 - (sum % 10)) % 10);
}

export function isValidTicketNumber(value) {
  if (!/^\d{13}$/.test(value)) return false;
  return luhnCheckDigit(value.slice(0, 12)) === value[12];
}
