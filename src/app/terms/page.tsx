import { FileText } from 'lucide-react';
import { FeaturePlaceholderPage } from '@/components/screens/FeaturePlaceholderPage';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background-dark">
      <FeaturePlaceholderPage
        title="Termini di Servizio"
        description="Stiamo finalizzando i termini legali aggiornati. Questa pagina verra pubblicata con la versione completa al prossimo rilascio."
        icon={FileText}
        badge="Pagina legale in preparazione"
        primaryAction={{ href: '/auth/login', label: 'Torna al Login' }}
        secondaryAction={{ href: '/onboarding', label: 'Vai all\'Onboarding' }}
      />
    </main>
  );
}
