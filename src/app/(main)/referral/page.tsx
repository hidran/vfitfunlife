import { Gift } from 'lucide-react';
import { FeaturePlaceholderPage } from '@/components/screens/FeaturePlaceholderPage';

export default function ReferralPage() {
  return (
    <FeaturePlaceholderPage
      title="Referral Program"
      description="Il programma inviti e premi e in fase di finalizzazione con tracking automatico dei referral."
      icon={Gift}
      badge="Referral in sviluppo"
      primaryAction={{ href: '/profile', label: 'Torna al Profilo' }}
      secondaryAction={{ href: '/home', label: 'Esplora la Home' }}
      notes={[
        'Premi per ogni amico registrato',
        'Bonus extra con attivazioni VIP',
      ]}
    />
  );
}
