import { notFound } from 'next/navigation';
import { FeaturePlaceholderPage } from '@/components/screens/FeaturePlaceholderPage';
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

  return (
    <FeaturePlaceholderPage
      title={content.title}
      description={content.description}
      icon={content.icon}
      badge={content.badge ?? 'VLife in aggiornamento'}
      notes={content.notes}
      primaryAction={content.primaryAction ?? { href: '/home', label: 'Torna alla Home' }}
      secondaryAction={content.secondaryAction}
    />
  );
}
