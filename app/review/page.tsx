import type { Metadata } from 'next';
import ReviewDashboard from './review-dashboard';

export const metadata: Metadata = {
  title: 'Analyst review — GossipCheck',
  description: 'Private Tea review queue for authorized GossipCheck analysts.',
  robots: { index: false, follow: false },
};

export default function ReviewPage() {
  return <ReviewDashboard />;
}
