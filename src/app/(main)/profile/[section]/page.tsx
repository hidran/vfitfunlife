import { notFound } from 'next/navigation';
import { FeaturePlaceholderPage } from '@/components/screens/FeaturePlaceholderPage';
import {
  PROFILE_ROUTE_CONTENT,
  type ProfileRouteSection,
} from '@/lib/featureRouteContent';

export function generateStaticParams() {
  return Object.keys(PROFILE_ROUTE_CONTENT).map((section) => ({ section }));
}

export default function ProfileSectionPage({ params }: { params: { section: string } }) {
  const section = params.section as ProfileRouteSection;
  const content = PROFILE_ROUTE_CONTENT[section];

  if (!content) {
    notFound();
  }

  return (
    <FeaturePlaceholderPage
      title={content.title}
      description={content.description}
      icon={content.icon}
      badge={content.badge ?? 'Profilo in aggiornamento'}
      notes={content.notes}
      primaryAction={content.primaryAction}
      secondaryAction={content.secondaryAction}
    />
  );
}
