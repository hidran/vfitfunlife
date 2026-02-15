'use client';

import { useState } from 'react';
import { MessageSquareText, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function FeedbackPage() {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="container-mobile py-6 pb-24 space-y-5">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <h1 className="text-2xl font-display font-bold text-text-inverse">Valuta l&apos;app</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Il tuo feedback ci aiuta a migliorare VFit ogni settimana.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-medium text-text-inverse">Quanto sei soddisfatto?</p>
        <div className="mt-3 flex items-center gap-2">
          {Array.from({ length: 5 }).map((_, index) => {
            const value = index + 1;
            const active = value <= rating;
            return (
              <button
                key={value}
                type="button"
                aria-label={`Valutazione ${value}`}
                onClick={() => setRating(value)}
                className={cn(
                  'rounded-full border p-2 transition-colors',
                  active
                    ? 'border-yellow-400/60 bg-yellow-400/20'
                    : 'border-white/15 bg-white/5'
                )}
              >
                <Star
                  className={cn('h-5 w-5', active ? 'fill-yellow-400 text-yellow-400' : 'text-text-tertiary')}
                />
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <label htmlFor="feedback-comment" className="text-sm font-medium text-text-inverse">
          Commento (opzionale)
        </label>
        <textarea
          id="feedback-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={5}
          placeholder="Raccontaci cosa ti e piaciuto e cosa possiamo migliorare..."
          className={cn(
            'mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5',
            'text-sm text-white placeholder:text-text-tertiary outline-none focus:border-section-primary'
          )}
        />
      </section>

      <Button
        fullWidth
        disabled={rating === 0}
        onClick={() => setSubmitted(true)}
      >
        <MessageSquareText className="mr-2 h-4 w-4" />
        Invia feedback
      </Button>

      {submitted && (
        <p className="rounded-xl border border-success-DEFAULT/30 bg-success-DEFAULT/10 p-3 text-sm text-success-DEFAULT">
          Grazie! Il tuo feedback e stato registrato.
        </p>
      )}
    </div>
  );
}

