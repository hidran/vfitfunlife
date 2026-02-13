import { Shield } from 'lucide-react';
import { FeaturePlaceholderPage } from '@/components/screens/FeaturePlaceholderPage';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background-dark">
      <FeaturePlaceholderPage
        title="Privacy Policy"
        description="La privacy policy aggiornata verra pubblicata a breve con tutte le sezioni richieste per trattamento dati e diritti utente."
        icon={Shield}
        badge="Pagina legale in preparazione"
        primaryAction={{ href: '/auth/login', label: 'Torna al Login' }}
        secondaryAction={{ href: '/onboarding', label: 'Vai all\'Onboarding' }}
      />
    </main>
  );
}
