'use client';

import { Card, CardBody } from '@repo/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

import { formatDuration } from '../lib/search-params';

import type { Airline } from '../lib/types';

export interface FlightFiltersProps {
  readonly airlines: readonly Airline[];
  /** Cheapest fare on the route, in minor units, used to seed the price slider. */
  readonly priceFloor: number;
  readonly priceCeiling: number;
  readonly currency: string;
}

const DEPART_WINDOWS = [
  { id: 'early', label: 'Before 06:00', after: undefined, before: '06' },
  { id: 'morning', label: '06:00 – 12:00', after: '06', before: '12' },
  { id: 'afternoon', label: '12:00 – 18:00', after: '12', before: '18' },
  { id: 'evening', label: 'After 18:00', after: '18', before: undefined },
] as const;

const DURATION_CAPS = [
  { id: 'short', label: 'Under 3h', minutes: 180 },
  { id: 'medium', label: 'Under 6h', minutes: 360 },
  { id: 'long', label: 'Under 12h', minutes: 720 },
] as const;

function money(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minorUnits / 100);
}

/**
 * Filter sidebar.
 *
 * State lives entirely in the URL, so a filtered view is shareable and the server
 * component re-runs without any client-side flight data.
 */
export function FlightFilters({
  airlines,
  priceFloor,
  priceCeiling,
  currency,
}: FlightFiltersProps): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const selectedAirlines = params.getAll('airline');
  const [maxPrice, setMaxPrice] = useState(
    Number(params.get('maxPrice') ?? priceCeiling) || priceCeiling,
  );
  const duration = params.get('duration');
  const window_ = params.get('window');
  const refundable = params.get('refundable') === '1';

  const push = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      next.delete('cursor');
      mutate(next);
      startTransition(() => {
        router.push(`/search?${next.toString()}`, { scroll: false });
      });
    },
    [params, router],
  );

  function toggleAirline(code: string): void {
    push((next) => {
      const current = next.getAll('airline');
      next.delete('airline');
      const updated = current.includes(code)
        ? current.filter((entry) => entry !== code)
        : [...current, code];
      for (const entry of updated) next.append('airline', entry);
    });
  }

  function setSingle(key: string, value: string | undefined): void {
    push((next) => {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    });
  }

  const activeCount =
    selectedAirlines.length +
    (params.get('maxPrice') ? 1 : 0) +
    (duration ? 1 : 0) +
    (window_ ? 1 : 0) +
    (refundable ? 1 : 0);

  return (
    <Card className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <CardBody className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Filters</h2>
          {activeCount > 0 ? (
            <button
              type="button"
              onClick={() =>
                push((next) => {
                  for (const key of ['airline', 'maxPrice', 'duration', 'window', 'refundable']) {
                    next.delete(key);
                  }
                })
              }
              className="text-brand-600 text-sm font-medium hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Airline
          </legend>
          <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
            {airlines.map((airline) => (
              <label
                key={airline.iataCode}
                className="flex cursor-pointer items-center gap-2.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedAirlines.includes(airline.iataCode)}
                  onChange={() => toggleAirline(airline.iataCode)}
                  className="accent-brand-600 size-4 rounded border-slate-300 dark:border-slate-600"
                />
                <span className="text-slate-700 dark:text-slate-300">{airline.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Max price
          </legend>
          <input
            type="range"
            min={priceFloor}
            max={priceCeiling}
            step={1000}
            value={maxPrice}
            onChange={(event) => setMaxPrice(Number(event.target.value))}
            onMouseUp={() => setSingle('maxPrice', String(maxPrice))}
            onTouchEnd={() => setSingle('maxPrice', String(maxPrice))}
            onKeyUp={() => setSingle('maxPrice', String(maxPrice))}
            aria-label="Maximum price"
            className="accent-brand-600 w-full"
          />
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{money(priceFloor, currency)}</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {money(maxPrice, currency)}
            </span>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Departure time
          </legend>
          {DEPART_WINDOWS.map((entry) => (
            <label key={entry.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="radio"
                name="window"
                checked={window_ === entry.id}
                onChange={() => setSingle('window', entry.id)}
                className="accent-brand-600 size-4"
              />
              <span className="text-slate-700 dark:text-slate-300">{entry.label}</span>
            </label>
          ))}
          {window_ ? (
            <button
              type="button"
              onClick={() => setSingle('window', undefined)}
              className="self-start text-xs text-slate-500 hover:underline dark:text-slate-400"
            >
              Any time
            </button>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Duration
          </legend>
          {DURATION_CAPS.map((entry) => (
            <label key={entry.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="radio"
                name="duration"
                checked={duration === entry.id}
                onChange={() => setSingle('duration', entry.id)}
                className="accent-brand-600 size-4"
              />
              <span className="text-slate-700 dark:text-slate-300">
                {entry.label} · {formatDuration(entry.minutes)}
              </span>
            </label>
          ))}
          {duration ? (
            <button
              type="button"
              onClick={() => setSingle('duration', undefined)}
              className="self-start text-xs text-slate-500 hover:underline dark:text-slate-400"
            >
              Any duration
            </button>
          ) : null}
        </fieldset>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={refundable}
            onChange={() => setSingle('refundable', refundable ? undefined : '1')}
            className="accent-brand-600 size-4 rounded border-slate-300 dark:border-slate-600"
          />
          <span className="text-slate-700 dark:text-slate-300">Refundable fares only</span>
        </label>
      </CardBody>
    </Card>
  );
}
