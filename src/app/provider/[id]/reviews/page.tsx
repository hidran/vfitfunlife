import ProviderReviewsClient from './ProviderReviewsClient';

export function generateStaticParams() {
  return [{ id: 'dummy' }];
}

export default function ProviderReviewsPage() {
  return <ProviderReviewsClient />;
}
