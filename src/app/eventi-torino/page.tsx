import type { Metadata } from 'next';
import { TorinoLandingPage, torinoLandingMetadata } from '@/components/seo/TorinoLandingPage';
import { requireTorinoLanding } from '@/lib/seo/torinoLandings';

const landing = requireTorinoLanding('eventi-torino');

export const metadata: Metadata = torinoLandingMetadata(landing);

export default function EventiTorinoPage() {
  return <TorinoLandingPage landing={landing} />;
}
