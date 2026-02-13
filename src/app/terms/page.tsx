import Link from 'next/link';
import { FileText } from 'lucide-react';

const EFFECTIVE_DATE = '13 febbraio 2026';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background-dark">
      <div className="container-mobile py-8 pb-20 space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-section-primary" />
            <h1 className="text-2xl font-bold text-text-inverse">Termini di Servizio</h1>
          </div>
          <p className="text-sm text-text-secondary">Data di efficacia: {EFFECTIVE_DATE}</p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-text-secondary">
          <p>
            Utilizzando VFit accetti i presenti Termini di Servizio. Se non accetti i termini,
            interrompi l&apos;uso della piattaforma.
          </p>
        </section>

        <section className="space-y-4 text-sm text-text-secondary">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">1. Oggetto del servizio</h2>
            <p className="mt-2">
              VFit fornisce strumenti digitali per ricerca, prenotazione e gestione di servizi
              fitness, wellness e intrattenimento, inclusa interazione con provider terzi.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">2. Account e responsabilita</h2>
            <p className="mt-2">
              L&apos;utente e responsabile della correttezza dei dati forniti e della sicurezza delle
              credenziali. Qualsiasi uso improprio dell&apos;account deve essere segnalato
              tempestivamente.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">3. Prenotazioni, cancellazioni e rimborsi</h2>
            <p className="mt-2">
              Le condizioni di cancellazione e rimborso possono variare in base al provider e al
              tipo di servizio prenotato. Le policy applicabili sono mostrate durante il checkout.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">4. Condotte vietate</h2>
            <p className="mt-2">
              Non e consentito utilizzare la piattaforma per attività fraudolente, abusive o in
              violazione di legge. VFit puo sospendere o limitare account in caso di violazioni.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">5. Contatti</h2>
            <p className="mt-2">
              Per richieste legali o contrattuali: <a className="text-section-primary" href="mailto:legal@vfit.app">legal@vfit.app</a>
            </p>
          </article>
        </section>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/privacy"
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text-inverse"
          >
            Leggi la Privacy Policy
          </Link>
          <Link
            href="/auth/login"
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text-inverse"
          >
            Torna al Login
          </Link>
        </div>
      </div>
    </main>
  );
}
