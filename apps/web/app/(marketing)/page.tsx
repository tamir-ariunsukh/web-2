
import { Card, CardBody, CardHeader } from '@repo/ui';

import { SearchForm } from '../../components/search-form';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Find your next flight',
  description:
    'Search flights, pick your seat and get your ticket instantly. Refunds handled automatically.',
};

export default function HomePage(): React.JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12 sm:py-20">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Where are you flying?
        </h1>
        <p className="max-w-2xl text-slate-600 dark:text-slate-400">
          Compare fares, choose your seat on a live seat map, and get your boarding pass the
          moment payment clears.
        </p>
      </section>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Search flights</h2>
        </CardHeader>
        <CardBody>
          <SearchForm />
        </CardBody>
      </Card>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: 'Live seat selection',
            body: 'Seats are locked the moment you choose them, so what you see is really available.',
          },
          {
            title: 'Instant tickets',
            body: 'Boarding passes are issued automatically once payment settles. No waiting.',
          },
          {
            title: 'Straightforward refunds',
            body: 'Cancel from your booking page and the refund is processed without a phone call.',
          },
        ].map((feature) => (
          <Card key={feature.title}>
            <CardBody className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{feature.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{feature.body}</p>
            </CardBody>
          </Card>
        ))}
      </section>
    </main>
  );
}
