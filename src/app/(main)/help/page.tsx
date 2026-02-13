'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, CircleHelp, LifeBuoy, Mail, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: 'booking' | 'payments' | 'account';
}

const FAQS: FaqItem[] = [
  {
    id: 'f1',
    question: 'Come posso riprogrammare una prenotazione?',
    answer:
      'Apri la prenotazione dalla sezione Bookings e usa il pulsante "Riprogramma". Potrai scegliere uno slot disponibile.',
    category: 'booking',
  },
  {
    id: 'f2',
    question: 'Quando ricevo il rimborso in caso di cancellazione?',
    answer:
      'I rimborsi vengono elaborati automaticamente in base alla policy del provider e risultano visibili nel tuo metodo di pagamento entro pochi giorni.',
    category: 'payments',
  },
  {
    id: 'f3',
    question: 'Come aggiorno email e numero di telefono?',
    answer:
      'Vai in Profilo > Modifica Profilo per aggiornare i dati di contatto e completare eventuale verifica.',
    category: 'account',
  },
  {
    id: 'f4',
    question: 'Posso contattare il provider prima della sessione?',
    answer:
      'Sì, dopo la conferma puoi usare la chat della prenotazione per condividere dettagli operativi.',
    category: 'booking',
  },
];

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const [openItemId, setOpenItemId] = useState<string | null>(FAQS[0].id);

  const filteredFaqs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return FAQS;
    return FAQS.filter(
      (faq) =>
        faq.question.toLowerCase().includes(normalized) ||
        faq.answer.toLowerCase().includes(normalized)
    );
  }, [query]);

  return (
    <div className="container-mobile py-6 space-y-4 pb-20">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-section-primary" />
          <h1 className="text-2xl font-bold text-text-inverse">Centro Assistenza</h1>
        </div>
        <p className="text-sm text-text-secondary">
          Trova risposte rapide su account, pagamenti e prenotazioni.
        </p>
      </header>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <label htmlFor="help-search" className="sr-only">
          Cerca nelle FAQ
        </label>
        <input
          id="help-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca una domanda..."
          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary outline-none focus:border-section-primary"
        />
      </div>

      <section className="space-y-3">
        {filteredFaqs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-text-secondary">
            Nessun risultato per la ricerca corrente.
          </div>
        ) : (
          filteredFaqs.map((faq) => {
            const isOpen = openItemId === faq.id;
            return (
              <article key={faq.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <button
                  type="button"
                  onClick={() => setOpenItemId(isOpen ? null : faq.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <div className="flex items-start gap-2">
                    <CircleHelp className="mt-0.5 h-4 w-4 text-section-primary" />
                    <p className="font-medium text-text-inverse">{faq.question}</p>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-text-tertiary transition-transform',
                      isOpen && 'rotate-180'
                    )}
                  />
                </button>
                {isOpen && <p className="border-t border-white/10 px-4 py-3 text-sm text-text-secondary">{faq.answer}</p>}
              </article>
            );
          })
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/bookings"
          className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-text-secondary transition-colors hover:text-text-inverse"
        >
          <MessageCircle className="h-4 w-4 text-section-primary" />
          Supporto su prenotazioni
        </Link>
        <a
          href="mailto:support@vfit.app"
          className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-text-secondary transition-colors hover:text-text-inverse"
        >
          <Mail className="h-4 w-4 text-section-primary" />
          Scrivi a support@vfit.app
        </a>
      </section>
    </div>
  );
}
