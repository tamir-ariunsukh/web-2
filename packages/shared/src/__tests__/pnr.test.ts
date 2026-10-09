import { describe, expect, it } from 'vitest';

import {
  formatPnr,
  generatePnr,
  generateTicketNumber,
  isValidPnr,
  isValidTicketNumber,
} from '../pnr.js';

describe('PNR generation', () => {
  it('produces 6 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const pnr = generatePnr();
      expect(pnr).toHaveLength(6);
      expect(pnr).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
      // Visually ambiguous glyphs must never appear.
      expect(pnr).not.toMatch(/[0O1IL]/);
    }
  });

  it('validates well-formed PNRs case-insensitively', () => {
    expect(isValidPnr('abc234')).toBe(true);
    expect(isValidPnr('ABC234')).toBe(true);
    expect(isValidPnr('AB12')).toBe(false);
    expect(isValidPnr('ABCDE!')).toBe(false);
  });

  it('formats for display in two groups', () => {
    expect(formatPnr('abc234')).toBe('ABC-234');
  });
});

describe('ticket number', () => {
  it('builds a 13-digit Luhn-valid number', () => {
    const ticket = generateTicketNumber('205', 1234567);
    expect(ticket).toHaveLength(13);
    expect(isValidTicketNumber(ticket)).toBe(true);
  });

  it('rejects a number with a corrupted check digit', () => {
    const ticket = generateTicketNumber('205', 42);
    const corrupted = ticket.slice(0, 12) + String((Number(ticket[12]) + 1) % 10);
    expect(isValidTicketNumber(corrupted)).toBe(false);
  });

  it('produces distinct numbers for consecutive serials', () => {
    expect(generateTicketNumber('205', 1)).not.toBe(generateTicketNumber('205', 2));
  });

  it('rejects a malformed airline code', () => {
    expect(() => generateTicketNumber('20', 1)).toThrow(/3 digits/);
    expect(() => generateTicketNumber('20A', 1)).toThrow(/3 digits/);
  });

  it('rejects an out-of-range serial', () => {
    expect(() => generateTicketNumber('205', -1)).toThrow(/9-digit/);
    expect(() => generateTicketNumber('205', 1_000_000_000)).toThrow(/9-digit/);
    expect(() => generateTicketNumber('205', 1.5)).toThrow(/9-digit/);
  });
});
