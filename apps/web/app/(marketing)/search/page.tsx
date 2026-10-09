
import { Card, CardBody } from '@repo/ui';
import Link from 'next/link';

import { FlightCard } from '../../../components/flight-card';
import { searchFlights } from '../../../lib/flights';
import { parseSearchParams, todayIso } from '../../../lib/search-params';

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

  const result = await searchFlights({
    origin: params.origin,
    destination: params.destination,
    departDate,
    returnDate: params.returnDate,
    adults: params.adults,
    children: params.children,
    infants: params.infants,
    cabin: params.cabin,
  });

  const passengerCount = params.adults + params.children;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
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

      {result.flights.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">No flights found</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Try a different date or route. Fares change often, so a nearby date may be cheaper.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {result.totalCount} {result.totalCount === 1 ? 'flight' : 'flights'}
          </p>

          <ul className="flex flex-col gap-4">
            {result.flights.map((flight) => (
              <li key={flight.id}>
                <FlightCard flight={flight} passengerCount={passengerCount} />
              </li>
            ))}
          </ul>

          {result.nextCursor ? (
            <a
              href={`/search?${new URLSearchParams({
                origin: params.origin,
                destination: params.destination,
                departDate,
                adults: String(params.adults),
                children: String(params.children),
                infants: String(params.infants),
                cabin: params.cabin,
                cursor: result.nextCursor,
              }).toString()}`}
              className="hover:bg-slate-50 dark:hover:bg-slate-800 self-center rounded-full px-5 py-2.5 text-sm font-medium ring-1 ring-slate-300 transition dark:ring-slate-700"
            >
              Show more flights
            </a>
          ) : null}
        </>
      )}
    </main>
  );
}
