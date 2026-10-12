import { BookingDetail } from '../../../../components/booking-detail';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Booking details',
  robots: { index: false },
};

interface BookingDetailPageProps {
  readonly params: Promise<{ pnr: string }>;
}

export default async function BookingDetailPage({
  params,
}: BookingDetailPageProps): Promise<React.JSX.Element> {
  const { pnr } = await params;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <BookingDetail pnr={pnr.toUpperCase()} />
    </main>
  );
}
