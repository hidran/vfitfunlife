'use client';

import Link from 'next/link';
import { MapPinOff, ChevronLeft } from 'lucide-react';

interface VenueNotFoundProps {
  onRetry?: () => void;
  message?: string;
}

export function VenueNotFound({ onRetry, message }: VenueNotFoundProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="rounded-full bg-slate-100 p-4">
        <MapPinOff className="h-8 w-8 text-slate-500" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">
        {message ?? 'Venue non trovato'}
      </h2>
      <p className="max-w-sm text-sm text-slate-500">
        Il venue richiesto non e disponibile o e stato rimosso.
      </p>
      <div className="flex gap-2">
        <Link
          href="/fit/gyms"
          className="inline-flex h-10 items-center gap-1 rounded-full bg-vfit-accent px-4 text-sm font-medium text-white"
        >
          <ChevronLeft className="h-4 w-4" /> Sfoglia palestre
        </Link>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-10 items-center rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700"
          >
            Riprova
          </button>
        )}
      </div>
    </div>
  );
}
