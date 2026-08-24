import type { Metadata } from 'next';
import CheckFlow from '../check/check-flow';

export const metadata: Metadata = {
  title: 'Private report — GossipCheck',
  description: 'Review your saved GossipCheck evidence, source status, and private scan history.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Private report — GossipCheck',
    description: 'Review your saved GossipCheck evidence, source status, and private scan history.',
    images: [],
  },
  twitter: {
    card: 'summary',
    title: 'Private report — GossipCheck',
    description: 'Review your saved GossipCheck evidence, source status, and private scan history.',
    images: [],
  },
};

export default function ReportPage() {
  return <CheckFlow initialView="report" />;
}
