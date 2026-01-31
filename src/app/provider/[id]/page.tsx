import ProviderProfileClient from './ProviderProfileClient';

// For static export, we need to provide at least one static path.
// In production, you'll want to fetch the list of provider IDs from your database
// and return them here during build time.
export async function generateStaticParams() {
  return [{ id: 'dummy' }];
}

export default function ProviderProfilePage({ params }: { params: { id: string } }) {
  return <ProviderProfileClient />;
}
