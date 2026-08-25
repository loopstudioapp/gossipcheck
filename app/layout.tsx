import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://gossipcheck.app'),
  title: 'GossipCheck — Know what they say about you',
  description: 'A private, evidence-first reputation check across supported public sources.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'GossipCheck — Know what they say about you',
    description: 'Private reputation checks with evidence.',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'GossipCheck private reputation check' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GossipCheck — Know what’s public about you',
    description: 'Private reputation checks with evidence.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
