/** Formatting and small helpers shared by every page. */

/** Amounts are stored in minor units, so they are divided before formatting. */
export function money(minorUnits, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    (minorUnits ?? 0) / 100,
  );
}

export function duration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** `HH:mm` in the airport's own zone, which is what a traveller reads. */
export function timeInZone(iso, timezone) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(11, 16);
  }
}

export function dateInZone(iso, timezone) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

export function dateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function articleDate(iso) {
  return String(iso).split('-').join('.');
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function statusLabel(status) {
  return String(status ?? '').replace(/_/g, ' ');
}

const STATUS_TONES = {
  CONFIRMED: 'success',
  TICKETED: 'info',
  CHECKED_IN: 'info',
  HELD: 'warning',
  PENDING_PAYMENT: 'warning',
  PAYMENT_FAILED: 'danger',
  CANCELLED: 'danger',
  EXPIRED: 'neutral',
  ISSUED: 'success',
  PENDING: 'warning',
  VOIDED: 'neutral',
  REFUNDED: 'danger',
  ADMIN: 'info',
  AGENT: 'warning',
  CUSTOMER: 'neutral',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  REQUIRES_ACTION: 'warning',
};

export function statusTone(status) {
  return STATUS_TONES[status] ?? 'neutral';
}

/** Escapes text for interpolation into an HTML template. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function initials(firstName, lastName) {
  return `${String(firstName ?? '').slice(0, 1)}${String(lastName ?? '').slice(0, 1)}`.toUpperCase();
}

export function cabinLabel(cabin) {
  return (
    {
      FIRST: 'First',
      BUSINESS: 'Business',
      PREMIUM_ECONOMY: 'Premium Economy',
      ECONOMY: 'Economy',
    }[cabin] ?? cabin
  );
}

/** Groups an array by a key function, preserving insertion order. */
export function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

/** Runs `fn`, converting a thrown ApiError into a message for inline display. */
export async function attempt(fn, fallback = 'Something went wrong. Please try again.') {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: error?.message ?? fallback, code: error?.code };
  }
}
