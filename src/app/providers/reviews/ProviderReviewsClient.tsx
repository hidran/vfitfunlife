'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { readIdParam } from '@/lib/routes';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { useInstructorReviews } from '@/hooks/useCommunity';
import { useProviderPublicProfile } from '@/hooks/useProviderPublicProfile';
import { Spinner } from '@/components/ui/Spinner';
import { isReviewTagKey, reviewTagLabelKey } from '@/lib/reviews/errors';

type RatingFilter = 'all' | 5 | 4 | 3;

export default function ProviderReviewsClient() {
  const { t, locale } = useI18n();
  const router = useRouter();
  // Served from /providers/reviews?id=<providerId> — see src/lib/routes.ts.
  const providerId = readIdParam(useSearchParams());
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');

  // Written by the submitReview callable, one per delivered booking.
  const { data: reviews = [], isLoading } = useInstructorReviews(providerId ?? undefined);
  // Same query (and cache entry) as the provider detail page: name + avatar from instructors/{id}.
  // Unknown/unverified providers fall back to a generic label rather than the raw id.
  const { data: profile, isLoading: profileLoading } = useProviderPublicProfile(providerId ?? undefined);
  const providerName = profile?.fullName ?? t('providerReviews.unknownProvider');

  const filteredReviews = useMemo(() => {
    if (ratingFilter === 'all') return reviews;
    return reviews.filter((review) => Math.round(review.rating) === ratingFilter);
  }, [ratingFilter, reviews]);

  const averageRating = useMemo(() => {
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return reviews.length > 0 ? sum / reviews.length : 0;
  }, [reviews]);

  if (!providerId) {
    return (
      <div className="min-h-screen bg-background-dark flex flex-col items-center justify-center p-4">
        <p className="text-error text-lg">{t('providerProfile.error.notFound')}</p>
        <Button variant="primary" className="mt-4" onClick={() => router.back()}>
          {t('providerProfile.goBack')}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-dark">
      <div className="sticky top-0 z-20 border-b border-hairline bg-background-dark/95 backdrop-blur-md">
        <div className="flex items-center gap-3 p-4">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label={t('providerProfile.goBack')}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-content/10"
          >
            <ArrowLeft className="h-5 w-5 text-content" />
          </button>
          <h1 className="text-lg font-semibold text-content">{t('providerReviews.title')}</h1>
        </div>
      </div>

      <div className="space-y-4 p-4 pb-10">
        <section className="rounded-2xl border border-hairline bg-surface-2 p-4">
          <div className="flex items-center gap-3">
            {profileLoading ? (
              <>
                <div className="h-10 w-10 animate-pulse rounded-full bg-content/10" aria-hidden="true" />
                <div className="h-5 w-32 animate-pulse rounded bg-content/10" aria-hidden="true" />
              </>
            ) : (
              <>
                <Avatar src={profile?.avatarUrl ?? undefined} name={providerName} size="md" />
                <p className="font-medium text-content" data-testid="provider-name">{providerName}</p>
              </>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-3 py-1 text-warning">
              <Star className="h-4 w-4 fill-warning" />
              <span className="text-sm font-semibold">{averageRating.toFixed(1)}</span>
            </div>
            <span className="text-sm text-text-secondary">{t('providerReviews.totalReviews', { count: reviews.length })}</span>
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
                  ? 'border-[var(--section-primary)] bg-[var(--section-primary)]/20 text-content'
                  : 'border-hairline text-text-secondary hover:text-content'
              )}
            >
              {value === 'all' ? t('providerReviews.filter.all') : t('providerReviews.filter.stars', { count: value })}
            </button>
          ))}
        </section>

        <section className="space-y-3">
          {isLoading ? (
            <div className="flex justify-center p-6">
              <Spinner size="md" />
            </div>
          ) : filteredReviews.length === 0 ? (
            <div className="rounded-2xl border border-hairline bg-surface-2 p-5 text-center text-text-secondary">
              {reviews.length === 0 ? t('providerReviews.emptyAll') : t('providerReviews.noReviews')}
            </div>
          ) : (
            filteredReviews.map((review) => {
              const date = review.createdAt?.toDate?.();
              const tags = (review.tags ?? []).filter(isReviewTagKey);
              return (
                <article key={review.id} className="rounded-2xl border border-hairline bg-surface-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar src={review.avatarUrl ?? undefined} name={review.userName} size="md" />
                      <div>
                        <p className="font-medium text-content">{review.userName}</p>
                        <p className="text-xs text-text-tertiary">
                          {date
                            ? date.toLocaleDateString(toLocaleTag(locale), {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })
                            : null}
                          {review.isVerified ? (
                            <span className="ml-2 text-success">{t('providerReviews.verified')}</span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <Badge variant="warning" size="sm">
                      <span
                        className="inline-flex items-center gap-1"
                        aria-label={t('providerReviews.ratingAria', { value: review.rating })}
                      >
                        <Star className="h-3 w-3 fill-warning" aria-hidden="true" />
                        {review.rating}
                      </span>
                    </Badge>
                  </div>
                  {review.text ? (
                    <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-text-secondary">
                      {review.text}
                    </p>
                  ) : null}
                  {tags.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <li
                          key={tag}
                          className="rounded-full border border-hairline px-2.5 py-1 text-xs text-text-secondary"
                        >
                          {t(reviewTagLabelKey(tag))}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
