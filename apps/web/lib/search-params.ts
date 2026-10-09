import { z } from 'zod';

/**
 * Search parameters arrive as strings, so they are parsed rather than trusted.
 * A malformed deep link falls back to defaults instead of throwing.
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
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === 'string') {
      flat[key] = single;
    }
  }

  const result = searchParamsSchema.safeParse(flat);
  if (result.success) {
    return { params: result.data, invalid: false };
  }

  // Keep whatever parsed and default the rest, so one bad field does not blank
  // out an otherwise valid search.
  const partial = searchParamsSchema.partial().safeParse(flat);
  const fallback = searchParamsSchema.parse({});
  return {
    params: { ...fallback, ...(partial.success ? partial.data : {}) },
    invalid: true,
  };
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
