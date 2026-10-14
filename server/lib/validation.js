/**
 * Input validation.
 *
 * Hand-written validators rather than a schema library: the API surface is small
 * and fixed, and keeping the validation dependency-free is the point of this
 * build. Each validator returns `{ ok: true, value }` or
 * `{ ok: false, errors: { field: message } }`.
 */

import { AppError } from './errors.js';
import { CABIN_CLASSES, Gender, PassengerType } from './enums.js';

const IATA_RE = /^[A-Z]{3}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PNR_RE = /^[A-Z0-9]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value.trim());
}

export function isIata(value) {
  return typeof value === 'string' && IATA_RE.test(value.trim().toUpperCase());
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function isDateOnly(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function isTimeOfDay(value) {
  return typeof value === 'string' && TIME_RE.test(value);
}

export function isPnr(value) {
  return typeof value === 'string' && PNR_RE.test(value.trim().toUpperCase());
}

export function isCabinClass(value) {
  return CABIN_CLASSES.includes(value);
}

/** Normalises a phone number to digits, keeping a leading `+`. */
export function normalisePhone(value) {
  const digits = String(value).replace(/[^\d]/g, '');
  return String(value).trim().startsWith('+') ? `+${digits}` : digits;
}

export function isValidPhone(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 7 || trimmed.length > 20) return false;
  return /^\+?[\d\s\-().]+$/.test(trimmed);
}

/**
 * Password policy: 12+ characters with lower, upper, digit and symbol.
 *
 * The password itself is never stored — only an scrypt hash and its salt.
 */
export function passwordProblems(value) {
  const problems = [];
  if (typeof value !== 'string' || value.length < 12) {
    problems.push('Password must be at least 12 characters');
  }
  if (typeof value === 'string' && value.length > 128) {
    problems.push('Password must be at most 128 characters');
  }
  if (!/[a-z]/.test(value ?? '')) problems.push('Password must contain a lowercase letter');
  if (!/[A-Z]/.test(value ?? '')) problems.push('Password must contain an uppercase letter');
  if (!/\d/.test(value ?? '')) problems.push('Password must contain a digit');
  if (!/[^A-Za-z0-9]/.test(value ?? '')) problems.push('Password must contain a symbol');
  return problems;
}

export function validatePassengerCount(input = {}) {
  const adults = Number(input.adults ?? 1);
  const children = Number(input.children ?? 0);
  const infants = Number(input.infants ?? 0);
  const errors = {};

  if (!Number.isInteger(adults) || adults < 1 || adults > 9) {
    errors.adults = 'Between 1 and 9 adults are required';
  }
  if (!Number.isInteger(children) || children < 0 || children > 8) {
    errors.children = 'Children must be between 0 and 8';
  }
  if (!Number.isInteger(infants) || infants < 0 || infants > 4) {
    errors.infants = 'Infants must be between 0 and 4';
  }
  if (!errors.infants && infants > adults) {
    errors.infants = 'Each infant must be accompanied by an adult';
  }
  if (!errors.adults && !errors.children && adults + children > 9) {
    errors.children = 'A booking may contain at most 9 seated passengers';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { adults, children, infants } };
}

export function validateFlightSearch(input = {}) {
  const errors = {};
  const origin = String(input.origin ?? '').trim().toUpperCase();
  const destination = String(input.destination ?? '').trim().toUpperCase();

  if (!IATA_RE.test(origin)) errors.origin = 'Must be a 3-letter IATA code';
  if (!IATA_RE.test(destination)) errors.destination = 'Must be a 3-letter IATA code';
  if (!errors.origin && !errors.destination && origin === destination) {
    errors.destination = 'Origin and destination must differ';
  }

  const departDate = String(input.departDate ?? '');
  if (!isDateOnly(departDate)) errors.departDate = 'Expected YYYY-MM-DD';

  const returnDate = input.returnDate ? String(input.returnDate) : undefined;
  if (returnDate !== undefined) {
    if (!isDateOnly(returnDate)) errors.returnDate = 'Expected YYYY-MM-DD';
    else if (!errors.departDate && returnDate < departDate) {
      errors.returnDate = 'Return date cannot precede departure';
    }
  }

  const passengers = validatePassengerCount(input.passengers ?? {});
  if (!passengers.ok) errors.passengers = 'Invalid passenger count';

  const cabin = input.cabin ?? 'ECONOMY';
  if (!isCabinClass(cabin)) errors.cabin = 'Unknown cabin';

  const limit = Number(input.limit ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    errors.limit = 'Limit must be between 1 and 50';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      origin,
      destination,
      departDate,
      ...(returnDate ? { returnDate } : {}),
      passengers: passengers.value,
      cabin,
      filters: input.filters ?? {},
      sort: input.sort ?? 'BEST',
      ...(input.cursor ? { cursor: String(input.cursor) } : {}),
      limit,
    },
  };
}

export function validatePassenger(input = {}, index = 0) {
  const errors = {};
  const type = input.type ?? PassengerType.ADULT;
  if (!Object.values(PassengerType).includes(type)) errors.type = 'Unknown passenger type';

  const firstName = String(input.firstName ?? '').trim();
  const lastName = String(input.lastName ?? '').trim();
  if (firstName.length < 1 || firstName.length > 64) errors.firstName = 'Required';
  if (lastName.length < 1 || lastName.length > 64) errors.lastName = 'Required';

  if (!isDateOnly(input.dateOfBirth)) errors.dateOfBirth = 'Use YYYY-MM-DD';

  const gender = input.gender ?? Gender.UNSPECIFIED;
  if (!Object.values(Gender).includes(gender)) errors.gender = 'Unknown gender';

  // Passport fields are all-or-nothing: half an identity document is worse than
  // none, because it looks complete.
  const provided = [input.passportNumber, input.passportExpiry, input.passportIssuingCountry]
    .filter((field) => field !== undefined && field !== null && field !== '').length;
  if (provided !== 0 && provided !== 3) {
    errors.passportNumber = 'Passport number, expiry and issuing country must be provided together';
  } else if (provided === 3) {
    if (!/^[A-Za-z0-9]{5,20}$/.test(String(input.passportNumber).trim())) {
      errors.passportNumber = 'Passport number must be alphanumeric';
    }
    if (!isDateOnly(input.passportExpiry)) errors.passportExpiry = 'Use YYYY-MM-DD';
    else if (isDateOnly(input.dateOfBirth) && input.passportExpiry <= input.dateOfBirth) {
      errors.passportExpiry = 'Passport expiry must be after the date of birth';
    }
    if (!isIata(input.passportIssuingCountry)) {
      errors.passportIssuingCountry = 'Use a 3-letter country code';
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors, index };
  return {
    ok: true,
    value: {
      type,
      gender,
      firstName,
      lastName,
      ...(input.middleName ? { middleName: String(input.middleName).trim() } : {}),
      dateOfBirth: input.dateOfBirth,
      ...(input.nationality ? { nationality: String(input.nationality).toUpperCase() } : {}),
      ...(provided === 3
        ? {
            passportNumber: String(input.passportNumber).trim().toUpperCase(),
            passportExpiry: input.passportExpiry,
            passportIssuingCountry: String(input.passportIssuingCountry).toUpperCase(),
          }
        : {}),
    },
  };
}

export function validateCreateBooking(input = {}) {
  const errors = {};

  const segments = Array.isArray(input.segments) ? input.segments : [];
  if (segments.length < 1 || segments.length > 8) {
    errors.segments = 'An itinerary must contain between 1 and 8 segments';
  } else {
    segments.forEach((segment, index) => {
      if (!isUuid(segment?.flightId)) errors[`segments.${index}.flightId`] = 'Invalid flight id';
      if (!isUuid(segment?.fareId)) errors[`segments.${index}.fareId`] = 'Invalid fare id';
    });
  }

  if (!isEmail(input.contactEmail)) errors.contactEmail = 'Invalid email address';
  if (!isValidPhone(input.contactPhone)) errors.contactPhone = 'Invalid phone number';

  const emergencyName = input.emergencyContactName?.trim();
  const emergencyPhone = input.emergencyContactPhone?.trim();
  if ((emergencyName === undefined) !== (emergencyPhone === undefined)) {
    errors.emergencyContactPhone = 'Emergency contact name and phone must be provided together';
  }
  if (emergencyName !== undefined && (emergencyName.length < 2 || emergencyName.length > 120)) {
    errors.emergencyContactName = 'Emergency contact name must be 2 to 120 characters';
  }

  const passengers = Array.isArray(input.passengers) ? input.passengers : [];
  if (passengers.length < 1 || passengers.length > 9) {
    errors.passengers = 'A booking must contain between 1 and 9 passengers';
  } else {
    passengers.forEach((passenger, index) => {
      const result = validatePassenger(passenger, index);
      if (!result.ok) {
        for (const [field, message] of Object.entries(result.errors)) {
          errors[`passengers.${index}.${field}`] = message;
        }
      }
    });
  }

  if (input.promoCode !== undefined && input.promoCode !== null && input.promoCode !== '') {
    const promo = String(input.promoCode).trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(promo)) errors.promoCode = 'Promo code contains invalid characters';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      segments: segments.map((segment) => ({
        flightId: segment.flightId,
        fareId: segment.fareId,
      })),
      contactEmail: String(input.contactEmail).trim().toLowerCase(),
      contactPhone: normalisePhone(input.contactPhone),
      ...(emergencyName ? { emergencyContactName: emergencyName } : {}),
      ...(emergencyPhone ? { emergencyContactPhone: normalisePhone(emergencyPhone) } : {}),
      ...(input.homeAddress ? { homeAddress: String(input.homeAddress).trim() } : {}),
      passengers: passengers.map((passenger) => validatePassenger(passenger).value),
      ...(input.promoCode ? { promoCode: String(input.promoCode).trim().toUpperCase() } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: String(input.idempotencyKey) } : {}),
    },
  };
}

export function validateRegister(input = {}) {
  const errors = {};
  if (!isEmail(input.email)) errors.email = 'Invalid email address';

  const passwordErrors = passwordProblems(input.password);
  if (passwordErrors.length > 0) errors.password = passwordErrors[0];

  if (!String(input.firstName ?? '').trim()) errors.firstName = 'Required';
  if (!String(input.lastName ?? '').trim()) errors.lastName = 'Required';
  if (input.phone !== undefined && input.phone !== '' && !isValidPhone(input.phone)) {
    errors.phone = 'Invalid phone number';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      email: String(input.email).trim().toLowerCase(),
      password: input.password,
      firstName: String(input.firstName).trim(),
      lastName: String(input.lastName).trim(),
      ...(input.phone ? { phone: normalisePhone(input.phone) } : {}),
    },
  };
}

export function validateLogin(input = {}) {
  const errors = {};
  if (!isEmail(input.email)) errors.email = 'Invalid email address';
  if (!String(input.password ?? '')) errors.password = 'Password is required';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { email: String(input.email).trim().toLowerCase(), password: input.password } };
}

export function validateSeatSelections(selections) {
  if (!Array.isArray(selections) || selections.length === 0) {
    return { ok: false, errors: { selections: 'At least one seat must be selected' } };
  }
  const errors = {};
  selections.forEach((selection, index) => {
    if (!Number.isInteger(selection?.passengerIndex) || selection.passengerIndex < 0) {
      errors[`${index}.passengerIndex`] = 'Invalid passenger index';
    }
    if (!isUuid(selection?.segmentId)) errors[`${index}.segmentId`] = 'Invalid segment id';
    if (!isUuid(selection?.seatId)) errors[`${index}.seatId`] = 'Invalid seat id';
  });
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: selections };
}

export function validateContactUpdate(input = {}) {
  const errors = {};
  if (!isValidPhone(input.contactPhone)) errors.contactPhone = 'A contact phone number is required';
  if (input.contactEmail !== undefined && input.contactEmail !== '' && !isEmail(input.contactEmail)) {
    errors.contactEmail = 'Invalid email address';
  }

  const emergencyName = input.emergencyContactName?.trim() ?? '';
  const emergencyPhone = input.emergencyContactPhone?.trim() ?? '';
  if (emergencyName !== '' || emergencyPhone !== '') {
    if (emergencyName.length < 2) errors.emergencyContactName = 'Name is required';
    if (!isValidPhone(emergencyPhone)) errors.emergencyContactPhone = 'Invalid phone number';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      contactPhone: normalisePhone(input.contactPhone),
      ...(input.contactEmail ? { contactEmail: String(input.contactEmail).trim().toLowerCase() } : {}),
      ...(emergencyName ? { emergencyContactName: emergencyName } : {}),
      ...(emergencyPhone ? { emergencyContactPhone: normalisePhone(emergencyPhone) } : {}),
      ...(input.homeAddress !== undefined ? { homeAddress: String(input.homeAddress).trim() } : {}),
    },
  };
}

/** Throws `VALIDATION_FAILED` carrying flattened field errors. */
export function assertValid(result) {
  if (result.ok) return result.value;
  const first = Object.values(result.errors)[0] ?? 'Validation failed';
  throw new AppError('VALIDATION_FAILED', first, { details: result.errors });
}
