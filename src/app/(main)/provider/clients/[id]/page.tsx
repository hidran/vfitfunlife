import ClientDetailClient from './ClientDetailClient';

// Generate static params for static export
export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function ClientDetailPage() {
  return <ClientDetailClient />;
}
