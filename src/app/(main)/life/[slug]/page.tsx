import { notFound } from 'next/navigation';
import { LifeRouteScreen } from '@/components/screens/LifeRouteScreen';
import { LIFE_ROUTE_CONTENT, type LifeRouteSlug } from '@/lib/featureRouteContent';

export function generateStaticParams() {
  return Object.keys(LIFE_ROUTE_CONTENT).map((slug) => ({ slug }));
}

export default function LifeFeaturePage({ params }: { params: { slug: string } }) {
  const slug = params.slug as LifeRouteSlug;
  const content = LIFE_ROUTE_CONTENT[slug];

  if (!content) {
    notFound();
  }

  return <LifeRouteScreen slug={slug} />;
}
