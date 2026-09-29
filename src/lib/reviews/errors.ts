import type { MessageKey } from '@/i18n/messages';

/** Mirrors REVIEW_TAGS in functions/src/users/reviewRules.ts — the server drops anything else. */
export const REVIEW_TAG_KEYS = [
  'punctual',
  'professional',
  'clearComm',
  'topExperience',
  'convenientLocation',
  'doItAgain',
] as const;
export type ReviewTagKey = (typeof REVIEW_TAG_KEYS)[number];

export function reviewTagLabelKey(tag: ReviewTagKey): MessageKey {
  return `bookings.review.tag.${tag}` as MessageKey;
}

export function isReviewTagKey(value: unknown): value is ReviewTagKey {
  return typeof value === 'string' && (REVIEW_TAG_KEYS as readonly string[]).includes(value);
}

/** Same cap as REVIEW_COMMENT_MAX_LENGTH on the server. */
export const REVIEW_COMMENT_MAX_LENGTH = 1000;
export const REVIEW_COMMENT_MIN_LENGTH = 10;

/**
 * Why submitReview refused, as the review screen should say it. `alreadyReviewed` tells the
 * screen to stop offering the form: a second attempt can never succeed.
 */
export function reviewErrorFor(err: unknown): { key: MessageKey; alreadyReviewed: boolean } {
  const code = String((err as { code?: unknown } | null)?.code ?? '');
  switch (code) {
  case 'functions/already-exists':
    return { key: 'bookings.review.error.alreadyReviewed', alreadyReviewed: true };
  case 'functions/failed-precondition':
    return { key: 'bookings.review.error.notCompleted', alreadyReviewed: false };
  case 'functions/permission-denied':
  case 'functions/not-found':
    return { key: 'bookings.review.error.notAllowed', alreadyReviewed: false };
  case 'functions/invalid-argument':
    return { key: 'bookings.review.error.invalid', alreadyReviewed: false };
  case 'functions/unauthenticated':
    return { key: 'bookings.review.error.signIn', alreadyReviewed: false };
  default:
    return { key: 'bookings.review.error.generic', alreadyReviewed: false };
  }
}
