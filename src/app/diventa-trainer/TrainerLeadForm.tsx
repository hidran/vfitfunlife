'use client';

/**
 * Interest form for the public recruiting page.
 *
 * Submits through the `submitTrainerLead` callable rather than writing Firestore directly:
 * this is the only unauthenticated write in the product, so validation and rate limiting
 * belong on the server where they cannot be bypassed.
 */

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase/config';
import { Button } from '@/components/ui/button';

const SPECIALTIES = [
  'Personal training',
  'Functional training',
  'Yoga',
  'Pilates',
  'Preparazione atletica',
  'Riabilitazione / posturale',
  'Altro',
];

// Server error codes → copy. Anything unmapped falls back to the generic message, so a new
// server-side check can never render a blank error.
const ERRORS: Record<string, string> = {
  'missing-name': 'Inserisci il tuo nome.',
  'missing-contact': 'Lascia almeno un contatto: email o telefono.',
  'invalid-email': "L'email non sembra valida.",
  'invalid-phone': 'Il numero di telefono non sembra valido.',
  'missing-specialty': 'Seleziona la tua specialità.',
  'too-many-submissions': 'Hai già inviato una richiesta. Ti contattiamo a breve.',
};

export function TrainerLeadForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    try {
      const fn = httpsCallable(functions, 'submitTrainerLead');
      await fn({
        fullName: String(form.get('fullName') ?? ''),
        email: String(form.get('email') ?? ''),
        phone: String(form.get('phone') ?? ''),
        specialty: String(form.get('specialty') ?? ''),
        zone: String(form.get('zone') ?? ''),
        notes: String(form.get('notes') ?? ''),
      });
      setSent(true);
    } catch (err) {
      const code = (err as { message?: string })?.message ?? '';
      const key = Object.keys(ERRORS).find((k) => code.includes(k));
      setError(key ? ERRORS[key] : 'Invio non riuscito. Riprova tra poco.');
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div
        className="rounded-2xl border border-success/40 bg-success/10 p-6 text-center"
        role="status"
      >
        <p className="text-lg font-semibold text-content">Richiesta inviata</p>
        <p className="text-sm text-content-muted mt-2">
          Ti contattiamo entro pochi giorni per attivare il tuo profilo Trainer Fondatore.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="fullName" className="block text-sm font-medium text-content mb-1">
          Nome e cognome *
        </label>
        <input
          id="fullName" name="fullName" required autoComplete="name"
          className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 py-2 text-content"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-content mb-1">
            Email
          </label>
          <input
            id="email" name="email" type="email" autoComplete="email" inputMode="email"
            className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 py-2 text-content"
          />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-content mb-1">
            Telefono
          </label>
          <input
            id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel"
            className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 py-2 text-content"
          />
        </div>
      </div>
      <p className="text-xs text-content-muted -mt-2">Lascia almeno un contatto.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="specialty" className="block text-sm font-medium text-content mb-1">
            Specialità *
          </label>
          <select
            id="specialty" name="specialty" required defaultValue=""
            className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 py-2 text-content"
          >
            <option value="" disabled>Seleziona…</option>
            {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="zone" className="block text-sm font-medium text-content mb-1">
            Zona
          </label>
          <input
            id="zone" name="zone" placeholder="Es. Torino centro"
            className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 py-2 text-content"
          />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-content mb-1">
          Qualcosa su di te
        </label>
        <textarea
          id="notes" name="notes" rows={3}
          className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-content"
        />
      </div>

      {error && <p className="text-sm text-error" role="alert">{error}</p>}

      <Button type="submit" disabled={busy} className="w-full min-h-12">
        {busy ? 'Invio…' : 'Voglio candidarmi'}
      </Button>

      <p className="text-xs text-content-muted text-center">
        Nessun impegno. Ti contattiamo per una chiacchierata.
      </p>
    </form>
  );
}
