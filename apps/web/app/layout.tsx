import { SiteHeader } from '../components/site-header';
import { getSession } from '../lib/auth';

import type { Metadata, Viewport } from 'next';


import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Airline Booking',
    template: '%s | Airline Booking',
  },
  description: 'Search, book and manage flights. Seat selection, instant tickets and refunds.',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

export default async function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const user = await getSession();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">
        <SiteHeader user={user} />
        {children}
      </body>
    </html>
  );
}
