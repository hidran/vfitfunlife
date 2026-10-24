import type { Metadata } from 'next';
import { TorinoLandingPage, torinoLandingMetadata } from '@/components/seo/TorinoLandingPage';
import { requireTorinoLanding } from '@/lib/seo/torinoLandings';

const landing = requireTorinoLanding('personal-trainer-torino');

export const metadata: Metadata = torinoLandingMetadata(landing);

export default function PersonalTrainerTorinoPage() {
  return <TorinoLandingPage landing={landing} />;
}
