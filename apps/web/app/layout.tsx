import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
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

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
