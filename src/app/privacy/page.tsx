import Link from 'next/link';
import { Shield } from 'lucide-react';

const EFFECTIVE_DATE = '13 febbraio 2026';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background-dark">
      <div className="container-mobile py-8 pb-20 space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-section-primary" />
            <h1 className="text-2xl font-bold text-text-inverse">Privacy Policy</h1>
          </div>
          <p className="text-sm text-text-secondary">Data di efficacia: {EFFECTIVE_DATE}</p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-text-secondary">
          <p>
            VFit tratta i dati personali nel rispetto delle normative applicabili, inclusi i
            principi del GDPR. Questa informativa spiega quali dati raccogliamo, come li usiamo e
            quali diritti puoi esercitare.
          </p>
        </section>

        <section className="space-y-4 text-sm text-text-secondary">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">1. Dati raccolti</h2>
            <p className="mt-2">
              Raccogliamo dati di account (nome, email, telefono), dati operativi di prenotazione,
              informazioni di pagamento tokenizzate tramite provider terzi e dati tecnici necessari
              per sicurezza e miglioramento del servizio.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">2. Finalita del trattamento</h2>
            <p className="mt-2">
              Utilizziamo i dati per erogare la piattaforma, confermare booking, prevenire frodi,
              fornire assistenza, inviare comunicazioni di servizio e gestire eventuali obblighi
              fiscali o legali.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">3. Conservazione</h2>
            <p className="mt-2">
              Conserviamo i dati per il tempo strettamente necessario alle finalita indicate e in
              conformita ai tempi di legge. I dati non piu necessari vengono cancellati o
              anonimizzati.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">4. Diritti dell&apos;utente</h2>
            <p className="mt-2">
              Puoi richiedere accesso, rettifica, cancellazione, limitazione, portabilita e
              opposizione al trattamento. Per esercitare i diritti puoi contattarci via email.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">5. Contatti privacy</h2>
            <p className="mt-2">
              Per richieste privacy: <a className="text-section-primary" href="mailto:privacy@vfit.app">privacy@vfit.app</a>
            </p>
          </article>
        </section>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/terms"
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text-inverse"
          >
            Leggi i Termini di Servizio
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
