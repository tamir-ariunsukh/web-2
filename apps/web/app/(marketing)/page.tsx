
import { Card, CardBody, CardHeader } from '@repo/ui';

import { HeroBanner } from '../../components/hero-banner';
import { SearchForm } from '../../components/search-form';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Find your next flight',
  description:
    'Search flights, pick your seat and get your ticket instantly. Refunds handled automatically.',
  openGraph: {
    title: 'Find your next flight',
    description: 'Search flights, pick your seat and get your ticket instantly.',
    images: [{ url: '/img/og.png', width: 1200, height: 628 }],
  },
};

export default function HomePage(): React.JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:py-12">
      {/* The banner is the LCP element, but it is deliberately NOT preloaded.
          The <picture> sits in the first HTML response, so the preload scanner
          already discovers its AVIF source immediately, and `fetchPriority` on the
          <img> carries the priority hint. A separate <link rel=preload> resolves
          the URL independently of <picture>, so any mismatch in `sizes` or format
          negotiation makes the browser fetch the preloaded frame and then fetch
          the real one as well - an extra download on every visit. */}
      <HeroBanner
        eyebrow="Fly smarter"
        title="Where are you flying?"
        subtitle="Compare fares, choose your seat on a live seat map, and get your boarding pass the moment payment clears."
      />

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
