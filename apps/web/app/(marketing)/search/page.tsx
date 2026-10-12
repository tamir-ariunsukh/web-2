import { Card, CardBody } from '@repo/ui';
import Link from 'next/link';

import { FlightCard } from '../../../components/flight-card';
import { FlightFilters } from '../../../components/flight-filters';
import { FlightSort } from '../../../components/flight-sort';
import { getAirlines, searchFlights } from '../../../lib/flights';
import { parseSearchParams, toFlightFilters, todayIso } from '../../../lib/search-params';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Flight results',
  robots: { index: false },
};

interface SearchPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({
  searchParams,
}: SearchPageProps): Promise<React.JSX.Element> {
  const raw = await searchParams;
  const { params, invalid } = parseSearchParams(raw);

  if (!params.origin || !params.destination) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-12">
        <Card>
          <CardBody className="flex flex-col gap-2">
            <h1 className="text-lg font-semibold">Choose a route first</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Return to the search page and enter where you are flying from and to.
            </p>
            <Link href="/" className="text-brand-600 text-sm font-medium hover:underline">
              Back to search
            </Link>
          </CardBody>
        </Card>
      </main>
    );
  }

  const departDate = params.departDate ?? todayIso();

  const [result, airlines] = await Promise.all([
    searchFlights({
      origin: params.origin,
      destination: params.destination,
      departDate,
      returnDate: params.returnDate,
      adults: params.adults,
      children: params.children,
      infants: params.infants,
      cabin: params.cabin,
      filters: toFlightFilters(params),
      sort: params.sort ?? 'BEST',
    }),
    getAirlines(),
  ]);

  const passengerCount = params.adults + params.children;

  // Slider bounds come from the route's own fares, so the control is always useful.
  const totals = result.flights
    .map((flight) => flight.lowestFare?.total)
    .filter((total): total is number => total !== undefined);
  const priceFloor = totals.length > 0 ? Math.min(...totals) : 0;
  const priceCeiling = totals.length > 0 ? Math.max(...totals) : 100_000;
  const currency = result.flights[0]?.lowestFare?.currency ?? 'USD';

  const hasFilters =
    params.airline !== undefined ||
    params.maxPrice !== undefined ||
    params.duration !== undefined ||
    params.window !== undefined ||
    params.refundable !== undefined;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {params.origin} to {params.destination}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {departDate} · {passengerCount} {passengerCount === 1 ? 'passenger' : 'passengers'} ·{' '}
          {params.cabin.replace('_', ' ').toLowerCase()}
        </p>
      </header>

      {invalid ? (
        <p
          role="status"
          className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          Some search options were not recognised and have been reset to defaults.
        </p>
      ) : null}

      {result.fromSnapshot ? (
        <p
          role="status"
          className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          Showing sample data — the API is not reachable, so prices and availability may be stale.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
        <FlightFilters
          airlines={airlines}
          priceFloor={priceFloor}
          priceCeiling={priceCeiling}
          currency={currency}
        />

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {result.totalCount} {result.totalCount === 1 ? 'flight' : 'flights'}
              {hasFilters ? ' after filters' : ''}
            </p>
            <FlightSort />
          </div>

          {result.flights.length === 0 ? (
            <Card>
              <CardBody className="flex flex-col gap-2">
                <h2 className="text-base font-semibold">No flights match</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Try relaxing the filters, or pick a different date. Fares change often, so a
                  nearby date may be cheaper.
                </p>
              </CardBody>
            </Card>
          ) : (
            <ul className="flex flex-col gap-4">
              {result.flights.map((flight) => (
                <li key={flight.id}>
                  <FlightCard flight={flight} passengerCount={passengerCount} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
