import { z } from 'zod';

import type { FlightFilters } from './flights';

/**
 * Search parameters arrive as strings, so they are parsed rather than trusted.
 * A malformed deep link falls back to defaults instead of throwing.
 *
 * Filter values are deliberately loose here and clamped again in
 * `toFlightFilters`, so a hand-edited URL cannot produce an invalid request.
 */
export const searchParamsSchema = z.object({
  origin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  destination: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  departDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  returnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  adults: z.coerce.number().int().min(1).max(9).default(1),
  children: z.coerce.number().int().min(0).max(8).default(0),
  infants: z.coerce.number().int().min(0).max(4).default(0),
  cabin: z.enum(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']).default('ECONOMY'),
  cursor: z.string().max(512).optional(),

  // Filters
  airline: z.union([z.string(), z.array(z.string())]).optional(),
  maxPrice: z.coerce.number().int().positive().optional(),
  duration: z.enum(['short', 'medium', 'long']).optional(),
  window: z.enum(['early', 'morning', 'afternoon', 'evening']).optional(),
  refundable: z.enum(['1']).optional(),
  sort: z
    .enum(['BEST', 'PRICE_ASC', 'PRICE_DESC', 'DURATION_ASC', 'DEPARTURE_ASC'])
    .optional(),
});

export type SearchParams = z.infer<typeof searchParamsSchema>;

export interface ParsedSearchParams {
  readonly params: SearchParams;
  /** True when the input was unusable and defaults were substituted. */
  readonly invalid: boolean;
}

/** Normalises a raw `searchParams` object from the router. */
export function parseSearchParams(
  raw: Record<string, string | string[] | undefined>,
): ParsedSearchParams {
  // `airline` is repeatable, so arrays are preserved rather than flattened.
  const input: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    input[key] = value;
  }

  const result = searchParamsSchema.safeParse(input);
  if (result.success) {
    return { params: result.data, invalid: false };
  }

  // Keep whatever parsed and default the rest, so one bad field does not blank
  // out an otherwise valid search.
  const partial = searchParamsSchema.partial().safeParse(input);
  const fallback = searchParamsSchema.parse({});
  return {
    params: { ...fallback, ...(partial.success ? partial.data : {}) },
    invalid: true,
  };
}

/** Selected airlines from a possibly-scalar parameter. */
function airlineList(params: SearchParams): string[] | undefined {
  if (params.airline === undefined) return undefined;
  const list = (Array.isArray(params.airline) ? params.airline : [params.airline])
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z0-9]{2}$/.test(code));
  return list.length > 0 ? list : undefined;
}

const DURATION_MINUTES = { short: 180, medium: 360, long: 720 } as const;

/**
 * Departure windows as `HH:mm`, which is what the API's `timeOfDaySchema` accepts.
 */
const DEPART_WINDOWS = {
  early: { after: undefined, before: '06:00' },
  morning: { after: '06:00', before: '12:00' },
  afternoon: { after: '12:00', before: '18:00' },
  evening: { after: '18:00', before: '23:59' },
} as const;

/** Maps validated URL parameters onto the API's filter input. */
export function toFlightFilters(params: SearchParams): FlightFilters | undefined {
  const window = params.window ? DEPART_WINDOWS[params.window] : undefined;

  const filters: FlightFilters = {
    ...(airlineList(params) ? { airlines: airlineList(params) } : {}),
    ...(params.maxPrice !== undefined ? { maxPrice: params.maxPrice } : {}),
    ...(params.duration ? { maxDurationMinutes: DURATION_MINUTES[params.duration] } : {}),
    ...(window?.after ? { departAfter: window.after } : {}),
    ...(window?.before ? { departBefore: window.before } : {}),
    ...(params.refundable === '1' ? { refundableOnly: true } : {}),
  };

  return Object.keys(filters).length > 0 ? filters : undefined;
}

/** Today as `YYYY-MM-DD`, used as the default departure date. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Formats a duration in minutes as `2h 35m`. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Formats an ISO timestamp as a local `HH:mm` in the given IANA timezone. */
export function formatTimeInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

/** Formats an ISO timestamp as a short local date, e.g. `Mon, 3 Mar`. */
export function formatDateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(iso));
}
