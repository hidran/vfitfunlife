import { Bell } from 'lucide-react';
import { FeaturePlaceholderPage } from '@/components/screens/FeaturePlaceholderPage';

export default function NotificationsPage() {
  return (
    <FeaturePlaceholderPage
      title="Notifiche"
      description="Il centro notifiche verra completato con feed eventi, promemoria booking e aggiornamenti account."
      icon={Bell}
      badge="Centro notifiche in sviluppo"
      primaryAction={{ href: '/home', label: 'Torna alla Home' }}
      secondaryAction={{ href: '/profile', label: 'Vai al Profilo' }}
      notes={[
        'Promemoria prenotazioni in arrivo',
        'Stato richieste provider e verifiche',
        'Aggiornamenti promozioni e punti',
      ]}
    />
  );
}
