'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Briefcase, Clock, CheckCircle, XCircle } from 'lucide-react';
import { SERVICE_CATEGORIES } from '@/lib/serviceCategories';
import { providerCardState } from '@/lib/providerStatus';
import { useProviderStatus, useSubmitProviderApplication } from '@/hooks/useProviderApplication';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function BecomeProviderCard() {
  const status = useProviderStatus();
  const variant = providerCardState(status);
  const submit = useSubmitProviderApplication();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');

  if (variant === 'verified') {
    return (
      <Link
        href="/provider/dashboard"
        className="flex items-center gap-3 rounded-xl border border-white/10 p-4 hover:bg-white/5"
      >
        <CheckCircle className="w-5 h-5 text-[#10B981]" />
        <div>
          <p className="text-white font-medium">Sei un professionista</p>
          <p className="text-sm text-white/50">Vai alla dashboard provider</p>
        </div>
      </Link>
    );
  }

  if (variant === 'pending') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4">
        <Clock className="w-5 h-5 text-[#F59E0B]" />
        <div>
          <p className="text-white font-medium">Richiesta in revisione</p>
          <p className="text-sm text-white/60">Sarai visibile dopo l'approvazione di un amministratore.</p>
        </div>
      </div>
    );
  }

  if (variant === 'rejected') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 p-4">
        <XCircle className="w-5 h-5 text-[#EF4444]" />
        <div>
          <p className="text-white font-medium">Richiesta non approvata</p>
          <p className="text-sm text-white/60">Contatta il supporto per maggiori informazioni.</p>
        </div>
      </div>
    );
  }

  // variant === 'cta'
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-3">
        <Briefcase className="w-5 h-5 text-vfit-primary" />
        <div className="flex-1">
          <p className="text-white font-medium">Diventa un professionista</p>
          <p className="text-sm text-white/50">Offri i tuoi servizi sulla piattaforma.</p>
        </div>
        {!open && <Button size="sm" onClick={() => setOpen(true)}>Inizia</Button>}
      </div>

      {open && (
        <div className="mt-4">
          <p className="text-sm text-white/60 mb-2">Che tipo di servizio offri?</p>
          <div className="flex flex-wrap gap-2">
            {SERVICE_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.name)}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm border transition-colors',
                  category === c.name
                    ? 'border-vfit-primary bg-vfit-primary/10 text-white'
                    : 'border-white/10 text-white/70 hover:bg-white/5'
                )}
              >
                <span className="mr-1">{c.icon}</span>{c.name}
              </button>
            ))}
          </div>
          {submit.isError && (
            <p className="text-sm text-[#EF4444] mt-2">Qualcosa è andato storto. Riprova.</p>
          )}
          <div className="flex gap-2 mt-4">
            <Button size="sm" disabled={!category || submit.isPending} onClick={() => submit.mutate(category)}>
              {submit.isPending ? 'Invio…' : 'Invia richiesta'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
          </div>
        </div>
      )}
    </div>
  );
}
