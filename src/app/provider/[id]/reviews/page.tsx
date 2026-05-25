import ProviderReviewsClient from './ProviderReviewsClient';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: 'dummy' }];
}

export default async function ProviderReviewsPage({ params }: { params: Promise<{ id: string }> }) {
  await params;
  return <ProviderReviewsClient />;
}
