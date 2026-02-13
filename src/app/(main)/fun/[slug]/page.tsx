import { notFound } from 'next/navigation';
import { FunRouteScreen } from '@/components/screens/FunRouteScreen';
import { FUN_ROUTE_CONTENT, type FunRouteSlug } from '@/lib/featureRouteContent';

export function generateStaticParams() {
  return Object.keys(FUN_ROUTE_CONTENT).map((slug) => ({ slug }));
}

export default function FunFeaturePage({ params }: { params: { slug: string } }) {
  const slug = params.slug as FunRouteSlug;
  const content = FUN_ROUTE_CONTENT[slug];

  if (!content) {
    notFound();
  }

  return <FunRouteScreen slug={slug} />;
}
