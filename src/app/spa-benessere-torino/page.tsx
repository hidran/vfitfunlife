import type { Metadata } from 'next';
import { TorinoLandingPage, torinoLandingMetadata } from '@/components/seo/TorinoLandingPage';
import { requireTorinoLanding } from '@/lib/seo/torinoLandings';

const landing = requireTorinoLanding('spa-benessere-torino');

export const metadata: Metadata = torinoLandingMetadata(landing);

export default function SpaBenessereTorinoPage() {
  return <TorinoLandingPage landing={landing} />;
}
