import type { Metadata } from 'next';
import { CalendarCheck, Euro, Radio, Sparkles, ShieldCheck, TrendingUp } from 'lucide-react';
import { TrainerLeadForm } from './TrainerLeadForm';

/**
 * Public recruiting page for the Torino pilot — the tool partner A sends to trainers.
 *
 * Sits outside the (main) route group on purpose: that layout gates on auth, and this page
 * has to be readable by someone who has never opened the app. It is also the first SEO
 * asset, so it is a server component with real metadata rather than a client-rendered
 * shell.
 *
 * Copy is Italian only, deliberately. This is marketing copy aimed at trainers in Turin;
 * running it through the five-locale system would mean four machine-ish translations
 * nobody will read, and would put a locale-switch flash in front of the one page whose job
 * is a first impression. The product UI stays fully localised.
 */

const URL = 'https://vfit-funlife.web.app/diventa-trainer';
const TITLE = 'Diventa Trainer Fondatore — V Fitness';
const DESCRIPTION =
  'Zero canone per i Trainer Fondatori. Prenotazioni e pagamenti tracciati, ' +
  'commissione solo sulle sessioni portate dalla piattaforma. Candidati per il pilota di Torino.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'personal trainer Torino', 'lavoro personal trainer', 'trainer fondatore',
    'app fitness Torino', 'clienti personal trainer',
  ],
  alternates: { canonical: URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: URL,
    siteName: 'V Fitness & Wellness',
    locale: 'it_IT',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
};

const BENEFITS = [
  {
    icon: Euro,
    title: 'Zero canone per i Trainer Fondatori',
    body: 'Nessun abbonamento, nessun costo fisso. Paghi una commissione solo sulle sessioni che ti porta la piattaforma — non su quelle dei tuoi clienti attuali.',
  },
  {
    icon: CalendarCheck,
    title: 'Prenotazioni e pagamenti tracciati',
    body: 'Ogni richiesta, conferma e pagamento resta registrato nel tuo profilo. Sai sempre chi ti ha pagato, quanto e quando.',
  },
  {
    icon: TrendingUp,
    title: 'Clienti nuovi, non solo i tuoi',
    body: 'Il tuo profilo è visibile a chi cerca un trainer nella tua zona. Le sessioni a domicilio, online e outdoor sono tutte gestite dall app.',
  },
  {
    icon: Radio,
    title: 'Dirette streaming',
    body: 'Allena più persone contemporaneamente con le sessioni in diretta, incluse nel profilo.',
  },
  {
    icon: Sparkles,
    title: 'Schede di allenamento con AI — in arrivo',
    body: 'Stiamo lavorando alla generazione assistita delle schede: tu imposti obiettivi e vincoli, rivedi e approvi. Non è ancora disponibile.',
  },
  {
    icon: ShieldCheck,
    title: 'Profilo verificato',
    body: 'Certificazioni e specialità verificate dallo staff: i clienti vedono con chi hanno a che fare.',
  },
];

export default function DiventaTrainerPage() {
  return (
    <main className="min-h-screen bg-surface">
      {/* Structured data, so this ranks for the searches trainers actually run.
          dangerouslySetInnerHTML is the standard Next.js JSON-LD pattern and is safe here
          precisely because every value is a compile-time constant declared above — no user
          input, no request data, nothing reaching this from Firestore. If that ever stops
          being true, this needs escaping or a sanitizer. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: TITLE,
            description: DESCRIPTION,
            url: URL,
            inLanguage: 'it-IT',
          }),
        }}
      />

      <section className="px-4 py-14 sm:py-20 max-w-3xl mx-auto text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--section-primary)]">
          Pilota Torino · posti limitati
        </p>
        <h1 className="mt-3 text-3xl sm:text-5xl font-bold text-content leading-tight">
          Diventa Trainer Fondatore
        </h1>
        <p className="mt-4 text-lg text-content-muted">
          Stiamo selezionando 20 personal trainer a Torino. Zero canone, pagamenti tracciati,
          e la possibilità di far crescere i tuoi clienti con noi.
        </p>
        <a
          href="#candidati"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-section-gradient px-8 text-white font-semibold shadow-lg"
        >
          Candidati ora
        </a>
      </section>

      <section className="px-4 pb-4 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BENEFITS.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-2xl border border-hairline bg-surface-elevated p-5">
              <Icon className="w-6 h-6 text-[var(--section-primary)]" aria-hidden />
              <h2 className="mt-3 font-semibold text-content">{title}</h2>
              <p className="mt-1.5 text-sm text-content-muted leading-relaxed">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 py-12 max-w-3xl mx-auto">
        <div className="rounded-2xl border border-hairline bg-surface-elevated p-6">
          <h2 className="text-xl font-semibold text-content">Come funziona</h2>
          <ol className="mt-4 space-y-3 text-sm text-content-muted">
            {[
              'Ci lasci i tuoi dati qui sotto.',
              'Ti contattiamo per una chiacchierata e verifichiamo le certificazioni.',
              'Pubblichiamo il tuo profilo con i tuoi servizi e prezzi.',
              'Ricevi richieste, le accetti e registri i pagamenti direttamente in app.',
            ].map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--section-primary)]/15 text-[var(--section-primary)] text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="candidati" className="px-4 pb-20 max-w-2xl mx-auto scroll-mt-8">
        <h2 className="text-2xl font-bold text-content text-center">Candidati</h2>
        <p className="mt-2 mb-6 text-center text-sm text-content-muted">
          Un minuto, e ti ricontattiamo noi.
        </p>
        <div className="rounded-2xl border border-hairline bg-surface-elevated p-6">
          <TrainerLeadForm />
        </div>
      </section>
    </main>
  );
}
