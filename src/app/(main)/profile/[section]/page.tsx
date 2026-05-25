import { notFound } from 'next/navigation';
import { ProfileSectionScreen } from '@/components/screens/ProfileSectionScreen';
import {
  PROFILE_ROUTE_CONTENT,
  type ProfileRouteSection,
} from '@/lib/featureRouteContent';

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PROFILE_ROUTE_CONTENT).map((section) => ({ section }));
}

export default async function ProfileSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const content = PROFILE_ROUTE_CONTENT[section as ProfileRouteSection];

  if (!content) {
    notFound();
  }

  return <ProfileSectionScreen section={section as ProfileRouteSection} />;
}
