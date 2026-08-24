import type { Metadata } from 'next';
import CheckFlow from './check-flow';

export const metadata: Metadata = {
  title: 'Run a private check — GossipCheck',
  description: 'Try the Tea-first GossipCheck workflow with clearly labeled demonstration results.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Run a private check — GossipCheck',
    description: 'Try the Tea-first GossipCheck workflow with clearly labeled demonstration results.',
    images: [],
  },
  twitter: {
    card: 'summary',
    title: 'Run a private check — GossipCheck',
    description: 'Try the Tea-first GossipCheck workflow with clearly labeled demonstration results.',
    images: [],
  },
};

export default function CheckPage() {
  return <CheckFlow />;
}
