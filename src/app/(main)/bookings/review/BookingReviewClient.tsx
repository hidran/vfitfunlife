'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, CheckCircle2, MessageSquare, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBookingStore } from '@/stores/bookingStore';
import { useAuthStore } from '@/stores/authStore';
import { getBookingSectionMeta } from '@/lib/bookingUtils';
import { canReview } from '@/lib/bookingStatus';
import { readIdParam } from '@/lib/routes';
import { submitReview } from '@/lib/firebase/functions';
import {
  REVIEW_COMMENT_MAX_LENGTH,
  REVIEW_COMMENT_MIN_LENGTH,
  REVIEW_TAG_KEYS,
  reviewErrorFor,
  reviewTagLabelKey,
  type ReviewTagKey,
} from '@/lib/reviews/errors';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import type { MessageKey } from '@/i18n/messages';

export default function BookingReviewClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  // Served from /bookings/review/?id=... — see ./page.tsx.
  const bookingId = readIdParam(useSearchParams()) ?? '';
  const { user } = useAuthStore();
  const {
    userBookings,
    currentBooking,
    fetchBooking,
    updateBookingInList,
    updateCurrentBooking,
  } = useBookingStore();

  const booking =
    userBookings.find((entry) => entry.id === bookingId) ||
    (currentBooking?.id === bookingId ? currentBooking : null);

  // A deep link (push, email, the bookings list after a reload) lands here with an empty
  // store. Keyed on `user`: a cold load restores the Firebase session asynchronously.
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const isKnown = Boolean(booking);
  useEffect(() => {
    if (!bookingId || !user || isKnown) return;
    let cancelled = false;
    void fetchBooking(bookingId).finally(() => {
      if (!cancelled) setFetchedFor(bookingId);
    });
    return () => {
      cancelled = true;
    };
  }, [bookingId, fetchBooking, isKnown, user]);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<ReviewTagKey[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [serverSaysReviewed, setServerSaysReviewed] = useState(false);

  const ratingLabelId = useId();
  const tagsLabelId = useId();
  const commentHintId = useId();

  const commentLength = comment.trim().length;
  const canSubmit = rating > 0 && commentLength >= REVIEW_COMMENT_MIN_LENGTH;

  const toggleTag = (tag: ReviewTagKey) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((entry) => entry !== tag) : [...prev, tag]
    );
  };

  const header = (
    <div className="sticky top-0 z-20 border-b border-hairline bg-background-dark/95 backdrop-blur-md">
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={() => router.back()}
          aria-label={t('bookings.review.back')}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors hover:bg-surface-2"
        >
          <ArrowLeft className="h-5 w-5 text-content" />
        </button>
        <h1 className="text-lg font-semibold text-content">{t('bookings.review.title')}</h1>
      </div>
    </div>
  );

  if (!booking) {
    const notFound = !bookingId || fetchedFor === bookingId;
    return (
      <div className="min-h-screen bg-background-dark">
        {header}
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          {notFound ? (
            <>
              <AlertCircle className="h-10 w-10 text-warning" />
              <p className="text-text-secondary">{t('bookings.review.notFound')}</p>
              <Button variant="secondary" onClick={() => router.replace('/bookings')}>
                {t('bookings.review.back')}
              </Button>
            </>
          ) : (
            <Spinner size="md" />
          )}
        </div>
      </div>
    );
  }

  const sectionMeta = getBookingSectionMeta(booking.serviceName);
  const providerName = booking.providerName || booking.instructorName || '';
  const instructorId = booking.instructorId || booking.providerId || '';
  const alreadyReviewed = booking.hasReviewed || serverSaysReviewed;
  const reviewable = canReview(booking.status, Boolean(booking.hasReviewed));

  const markReviewed = () => {
    const updated = { ...booking, hasReviewed: true, reviewId: booking.reviewId ?? booking.id };
    updateBookingInList(updated);
    updateCurrentBooking(updated);
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting || alreadyReviewed || !reviewable) return;
    setSubmitting(true);
    setErrorKey(null);
    try {
      await submitReview({
        bookingId: booking.id,
        rating,
        comment: comment.trim(),
        tags: selectedTags,
      });
      markReviewed();
      // The trainer's reviews and rating just changed.
      if (instructorId) {
        void queryClient.invalidateQueries({ queryKey: ['instructor-reviews', instructorId] });
      }
      setSubmitted(true);
      setTimeout(() => {
        router.replace(`/bookings/detail?id=${encodeURIComponent(booking.id)}&reviewed=true`);
      }, 1000);
    } catch (err) {
      const { key, alreadyReviewed: already } = reviewErrorFor(err);
      if (already) {
        markReviewed();
        setServerSaysReviewed(true);
      }
      setErrorKey(key);
    } finally {
      setSubmitting(false);
    }
  };

  const showForm = !alreadyReviewed && !submitted && reviewable;

  return (
    <div className="min-h-screen bg-background-dark">
      {header}

      <div className="space-y-4 p-4 pb-28">
        <div className="rounded-2xl border border-hairline bg-surface-2 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: sectionMeta.color, backgroundColor: sectionMeta.softColor }}
            >
              {sectionMeta.label}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Avatar src={booking.providerAvatar} alt={providerName} name={providerName} size="lg" />
            <div>
              <p className="font-semibold text-content">{providerName}</p>
              <p className="text-sm text-text-secondary">{booking.serviceName}</p>
            </div>
          </div>
        </div>

        {errorKey && !submitted && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-error/20 bg-error/10 p-3"
          >
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-error" />
            <p className="flex-1 text-sm text-error">{t(errorKey)}</p>
          </div>
        )}

        {submitted || alreadyReviewed ? (
          <div
            role="status"
            className="rounded-2xl border border-success/30 bg-success/15 p-5 text-center"
          >
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-success" />
            <p className="text-lg font-semibold text-success">
              {submitted ? t('bookings.review.successTitle') : t('bookings.review.alreadyTitle')}
            </p>
            <p className="mt-1 text-sm text-success/80">
              {submitted ? t('bookings.review.successSubtitle') : t('bookings.review.alreadySubtitle')}
            </p>
            <Button
              className="mt-4"
              onClick={() => router.replace(`/bookings/detail?id=${encodeURIComponent(booking.id)}`)}
            >
              {t('bookings.reschedule.backToDetails')}
            </Button>
          </div>
        ) : !reviewable ? (
          <div className="rounded-2xl border border-hairline bg-surface-2 p-5 text-center">
            <p className="text-sm text-text-secondary">{t('bookings.review.notReviewable')}</p>
            <Button
              className="mt-4"
              variant="secondary"
              onClick={() => router.replace(`/bookings/detail?id=${encodeURIComponent(booking.id)}`)}
            >
              {t('bookings.reschedule.backToDetails')}
            </Button>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-hairline bg-surface-2 p-4">
              <p id={ratingLabelId} className="text-sm text-text-secondary">
                {t('bookings.review.ratingLabel')}
              </p>
              <div
                role="group"
                aria-labelledby={ratingLabelId}
                className="mt-3 flex items-center justify-center gap-2"
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    aria-label={t('bookings.review.ratingAria', { value })}
                    aria-pressed={value === rating}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-transform hover:scale-105"
                  >
                    <Star
                      aria-hidden="true"
                      className={cn(
                        'h-9 w-9',
                        value <= rating ? 'fill-warning text-warning' : 'text-content-faint'
                      )}
                    />
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-hairline bg-surface-2 p-4">
              <p id={tagsLabelId} className="mb-3 text-sm text-text-secondary">
                {t('bookings.review.tagsLabel')}
              </p>
              <div role="group" aria-labelledby={tagsLabelId} className="flex flex-wrap gap-2">
                {REVIEW_TAG_KEYS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={selectedTags.includes(tag)}
                    className={cn(
                      'min-h-[44px] rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      selectedTags.includes(tag)
                        ? 'border-[var(--section-primary)] bg-[var(--section-primary)]/20 text-content'
                        : 'border-content/20 text-text-secondary hover:text-content'
                    )}
                  >
                    {t(reviewTagLabelKey(tag))}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-hairline bg-surface-2 p-4">
              <label
                htmlFor="review-comment"
                className="mb-2 inline-flex items-center gap-2 text-sm text-text-secondary"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                {t('bookings.review.commentLabel')}
              </label>
              <textarea
                id="review-comment"
                rows={5}
                value={comment}
                maxLength={REVIEW_COMMENT_MAX_LENGTH}
                aria-describedby={commentHintId}
                onChange={(event) => setComment(event.target.value)}
                placeholder={t('bookings.review.commentPlaceholder')}
                className="w-full resize-none rounded-xl border border-content/15 bg-surface-sunken p-3 text-sm text-content outline-none transition-colors focus:border-[var(--section-primary)]"
              />
              <p id={commentHintId} aria-live="polite" className="mt-2 text-xs text-text-tertiary">
                {commentLength < REVIEW_COMMENT_MIN_LENGTH
                  ? t('bookings.review.minChars', { count: commentLength })
                  : t('bookings.review.charCount', {
                    count: comment.length,
                    max: REVIEW_COMMENT_MAX_LENGTH,
                  })}
              </p>
            </section>
          </>
        )}
      </div>

      {showForm && (
        // Sits above the fixed TabBar (h-16 + safe area, z-50) so the submit button isn't covered;
        // the content's pb-28 plus MainLayout's tab-bar padding keep the last field clear of it.
        // pr-20 leaves room for the floating assistant button (same as profile/edit).
        <div
          data-testid="review-submit-bar"
          className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 border-t border-hairline bg-background-dark/90 p-4 pr-20 backdrop-blur-xl"
        >
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            isLoading={submitting}
          >
            {t('bookings.review.submit')}
          </Button>
        </div>
      )}
    </div>
  );
}
