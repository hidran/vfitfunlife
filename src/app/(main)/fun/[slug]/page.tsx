import { notFound } from 'next/navigation';
import { FeaturePlaceholderPage } from '@/components/screens/FeaturePlaceholderPage';
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

  return (
    <FeaturePlaceholderPage
      title={content.title}
      description={content.description}
      icon={content.icon}
      badge={content.badge ?? 'VFun in aggiornamento'}
      notes={content.notes}
      primaryAction={content.primaryAction}
      secondaryAction={content.secondaryAction}
    />
  );
}
