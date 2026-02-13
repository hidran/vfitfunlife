import { Crown } from 'lucide-react';
import { FeaturePlaceholderPage } from '@/components/screens/FeaturePlaceholderPage';

export default function VipPage() {
  return (
    <FeaturePlaceholderPage
      title="Programma VIP"
      description="Stiamo finalizzando i piani VIP con vantaggi esclusivi, sconti progressivi e priorita prenotazioni."
      icon={Crown}
      badge="VIP presto disponibile"
      primaryAction={{ href: '/profile', label: 'Torna al Profilo' }}
      secondaryAction={{ href: '/home', label: 'Esplora la Home' }}
    />
  );
}
