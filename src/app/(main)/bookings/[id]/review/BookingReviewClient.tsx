'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, MessageSquare, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBookingStore } from '@/stores/bookingStore';
import { buildFallbackBooking, getBookingSectionMeta } from '@/lib/bookingUtils';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/Avatar';

export default function BookingReviewClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const bookingId = params.id;
  const {
    userBookings,
    currentBooking,
    updateBookingInList,
    updateCurrentBooking,
  } = useBookingStore();

  const booking = useMemo(() => {
    return (
      userBookings.find((entry) => entry.id === bookingId) ||
      (currentBooking?.id === bookingId ? currentBooking : null) ||
      buildFallbackBooking(bookingId)
    );
  }, [bookingId, currentBooking, userBookings]);

  const sectionMeta = getBookingSectionMeta(booking.serviceName);

  const QUICK_TAGS = [
    t('bookings.review.tag.punctual'),
    t('bookings.review.tag.professional'),
    t('bookings.review.tag.clearComm'),
    t('bookings.review.tag.topExperience'),
    t('bookings.review.tag.convenientLocation'),
    t('bookings.review.tag.doItAgain'),
  ];

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const alreadyReviewed = booking.hasReviewed;
  const canSubmit = rating > 0 && comment.trim().length >= 10;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((entry) => entry !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting || alreadyReviewed) return;

    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 800));

    const updatedBooking = {
      ...booking,
      hasReviewed: true,
      reviewId: `local-review-${booking.id}`,
    };

    updateBookingInList(updatedBooking);
    updateCurrentBooking(updatedBooking);

    setSubmitting(false);
    setSubmitted(true);

    setTimeout(() => {
      router.replace(`/bookings/${booking.id}?reviewed=true`);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background-dark">
      <div className="sticky top-0 z-20 border-b border-hairline bg-background-dark/95 backdrop-blur-md">
        <div className="flex items-center gap-3 p-4">
          <button
            onClick={() => router.back()}
            className="rounded-full p-2 transition-colors hover:bg-surface-2"
          >
            <ArrowLeft className="h-5 w-5 text-content" />
          </button>
          <h1 className="text-lg font-semibold text-content">{t('bookings.review.title')}</h1>
        </div>
      </div>

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
            <Avatar src={booking.providerAvatar} alt={booking.providerName} size="lg" />
            <div>
              <p className="font-semibold text-content">{booking.providerName}</p>
              <p className="text-sm text-text-secondary">{booking.serviceName}</p>
            </div>
          </div>
        </div>

        {alreadyReviewed || submitted ? (
          <div className="rounded-2xl border border-success/30 bg-success/15 p-5 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-success" />
            <p className="text-lg font-semibold text-success">{t('bookings.review.successTitle')}</p>
            <p className="mt-1 text-sm text-success/80">
              {t('bookings.review.successSubtitle')}
            </p>
            <Button
              className="mt-4"
              onClick={() => router.replace(`/bookings/${booking.id}`)}
            >
              {t('bookings.reschedule.backToDetails')}
            </Button>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-hairline bg-surface-2 p-4">
              <p className="text-sm text-text-secondary">{t('bookings.review.ratingLabel')}</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    onClick={() => setRating(value)}
                    aria-label={t('bookings.review.ratingAria', { value })}
                    className="rounded-full p-1 transition-transform hover:scale-105"
                  >
                    <Star
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
              <p className="mb-3 text-sm text-text-secondary">{t('bookings.review.tagsLabel')}</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_TAGS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      selectedTags.includes(tag)
                        ? 'border-[var(--section-primary)] bg-[var(--section-primary)]/20 text-white'
                        : 'border-white/20 text-text-secondary hover:text-content'
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-hairline bg-surface-2 p-4">
              <label
                htmlFor="review-comment"
                className="mb-2 inline-flex items-center gap-2 text-sm text-text-secondary"
              >
                <MessageSquare className="h-4 w-4" />
                {t('bookings.review.commentLabel')}
              </label>
              <textarea
                id="review-comment"
                rows={5}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={t('bookings.review.commentPlaceholder')}
                className="w-full resize-none rounded-xl border border-white/15 bg-surface-sunken p-3 text-sm text-content outline-none transition-colors focus:border-[var(--section-primary)]"
              />
              <p className="mt-2 text-xs text-text-tertiary">
                {t('bookings.review.minChars', { count: comment.trim().length })}
              </p>
            </section>
          </>
        )}
      </div>

      {!alreadyReviewed && !submitted && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-hairline bg-background-dark/90 p-4 backdrop-blur-xl">
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
