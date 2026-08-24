import type { Metadata } from 'next';
import CheckFlow from './check-flow';

export const metadata: Metadata = {
  title: 'Run a private check — GossipCheck',
  description: 'Run a private Tea-first self-search and keep verified evidence in one report.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Run a private check — GossipCheck',
    description: 'Run a private Tea-first self-search and keep verified evidence in one report.',
    images: [],
  },
  twitter: {
    card: 'summary',
    title: 'Run a private check — GossipCheck',
    description: 'Run a private Tea-first self-search and keep verified evidence in one report.',
    images: [],
  },
};

export default function CheckPage() {
  return <CheckFlow />;
}
