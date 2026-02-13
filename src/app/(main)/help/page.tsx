import { LifeBuoy } from 'lucide-react';
import { FeaturePlaceholderPage } from '@/components/screens/FeaturePlaceholderPage';

export default function HelpPage() {
  return (
    <FeaturePlaceholderPage
      title="Centro Assistenza"
      description="Stiamo preparando guide, FAQ e supporto rapido per account, pagamenti e prenotazioni."
      icon={LifeBuoy}
      badge="Help center in arrivo"
      primaryAction={{ href: '/profile', label: 'Torna al Profilo' }}
      secondaryAction={{ href: '/home', label: 'Vai alla Home' }}
    />
  );
}
