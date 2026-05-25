import { notFound } from 'next/navigation';
import { FunRouteScreen } from '@/components/screens/FunRouteScreen';
import { FUN_ROUTE_CONTENT, type FunRouteSlug } from '@/lib/featureRouteContent';

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(FUN_ROUTE_CONTENT).map((slug) => ({ slug }));
}

export default async function FunFeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = FUN_ROUTE_CONTENT[slug as FunRouteSlug];

  if (!content) {
    notFound();
  }

  return <FunRouteScreen slug={slug as FunRouteSlug} />;
}
