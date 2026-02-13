'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';

interface ProviderReview {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
}

const REVIEWS: ProviderReview[] = [
  {
    id: 'r1',
    author: 'Marco R.',
    rating: 5,
    comment: 'Professionale, puntuale e molto chiaro nella spiegazione del trattamento.',
    date: '2026-02-10',
  },
  {
    id: 'r2',
    author: 'Giulia B.',
    rating: 5,
    comment: 'Esperienza ottima. Ambiente pulito e percorso personalizzato.',
    date: '2026-02-08',
  },
  {
    id: 'r3',
    author: 'Luca M.',
    rating: 4,
    comment: 'Seduta utile e comunicazione rapida in chat prima dell\'appuntamento.',
    date: '2026-02-04',
  },
  {
    id: 'r4',
    author: 'Sara T.',
    rating: 4,
    comment: 'Molto disponibile. Avrei preferito solo una durata leggermente maggiore.',
    date: '2026-01-30',
  },
];

type RatingFilter = 'all' | 5 | 4 | 3;

export default function ProviderReviewsClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const providerId = params.id;
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');

  const filteredReviews = useMemo(() => {
    if (ratingFilter === 'all') return REVIEWS;
    return REVIEWS.filter((review) => review.rating === ratingFilter);
  }, [ratingFilter]);

  const averageRating = useMemo(() => {
    const sum = REVIEWS.reduce((acc, review) => acc + review.rating, 0);
    return REVIEWS.length > 0 ? sum / REVIEWS.length : 0;
  }, []);

  return (
    <div className="min-h-screen bg-background-dark">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-background-dark/95 backdrop-blur-md">
        <div className="flex items-center gap-3 p-4">
          <button
            onClick={() => router.back()}
            className="rounded-full p-2 transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white">Recensioni Provider</h1>
        </div>
      </div>

      <div className="space-y-4 p-4 pb-10">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">Provider ID</p>
          <p className="font-medium text-white">{providerId}</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-3 py-1 text-warning">
              <Star className="h-4 w-4 fill-warning" />
              <span className="text-sm font-semibold">{averageRating.toFixed(1)}</span>
            </div>
            <span className="text-sm text-text-secondary">{REVIEWS.length} recensioni totali</span>
          </div>
        </section>

        <section className="flex flex-wrap gap-2">
          {(['all', 5, 4, 3] as RatingFilter[]).map((value) => (
            <button
              key={String(value)}
              onClick={() => setRatingFilter(value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                ratingFilter === value
                  ? 'border-[var(--section-primary)] bg-[var(--section-primary)]/20 text-white'
                  : 'border-white/20 text-text-secondary hover:text-white'
              )}
            >
              {value === 'all' ? 'Tutte' : `${value} stelle`}
            </button>
          ))}
        </section>

        <section className="space-y-3">
          {filteredReviews.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-text-secondary">
              Nessuna recensione per il filtro selezionato.
            </div>
          ) : (
            filteredReviews.map((review) => (
              <article key={review.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={review.author} size="md" />
                    <div>
                      <p className="font-medium text-white">{review.author}</p>
                      <p className="text-xs text-text-tertiary">
                        {new Date(review.date).toLocaleDateString('it-IT', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  <Badge variant="warning" size="sm">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-warning" />
                      {review.rating}
                    </span>
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">{review.comment}</p>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
