import { notFound } from 'next/navigation';
import { LifeRouteScreen } from '@/components/screens/LifeRouteScreen';
import { LIFE_ROUTE_CONTENT, type LifeRouteSlug } from '@/lib/featureRouteContent';

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(LIFE_ROUTE_CONTENT).map((slug) => ({ slug }));
}

export default async function LifeFeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = LIFE_ROUTE_CONTENT[slug as LifeRouteSlug];

  if (!content) {
    notFound();
  }

  return <LifeRouteScreen slug={slug as LifeRouteSlug} />;
}
