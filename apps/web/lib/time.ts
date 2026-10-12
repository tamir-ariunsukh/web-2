/**
 * Airport-local wall clock to a UTC instant.
 *
 * The JSON snapshot stores local wall-clock strings with no zone offset, so the
 * target timezone is used to work out what offset applies at that local time.
 * `Intl` resolves DST for the given date because the offset is computed from the
 * actual instant.
 */
export function localToUtc(local: string, timezone: string): string {
  const asUtc = new Date(`${local}Z`);
  if (Number.isNaN(asUtc.getTime())) return local;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(asUtc).map((part) => [part.type, part.value]),
  );
  const seenInZone = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '00' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  // `asUtc` is the wall clock read as if it were UTC; the difference between that
  // and how the zone actually renders it is the offset to subtract.
  const offset = seenInZone - asUtc.getTime();
  return new Date(asUtc.getTime() - offset).toISOString();
}
