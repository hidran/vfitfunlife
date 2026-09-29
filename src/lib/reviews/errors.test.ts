import { describe, expect, it } from 'vitest';
import { isReviewTagKey, reviewErrorFor } from './errors';

describe('reviewErrorFor', () => {
  it('treats already-exists as "already reviewed" and stops offering the form', () => {
    expect(reviewErrorFor({ code: 'functions/already-exists' })).toEqual({
      key: 'bookings.review.error.alreadyReviewed',
      alreadyReviewed: true,
    });
  });

  it('maps the other refusals to their own messages', () => {
    expect(reviewErrorFor({ code: 'functions/failed-precondition' }).key).toBe('bookings.review.error.notCompleted');
    expect(reviewErrorFor({ code: 'functions/permission-denied' }).key).toBe('bookings.review.error.notAllowed');
    expect(reviewErrorFor({ code: 'functions/not-found' }).key).toBe('bookings.review.error.notAllowed');
    expect(reviewErrorFor({ code: 'functions/invalid-argument' }).key).toBe('bookings.review.error.invalid');
    expect(reviewErrorFor({ code: 'functions/unauthenticated' }).key).toBe('bookings.review.error.signIn');
  });

  it('falls back to a generic message', () => {
    expect(reviewErrorFor(new Error('network'))).toEqual({
      key: 'bookings.review.error.generic',
      alreadyReviewed: false,
    });
    expect(reviewErrorFor(null).key).toBe('bookings.review.error.generic');
  });
});

describe('isReviewTagKey', () => {
  it('accepts only the known tag keys', () => {
    expect(isReviewTagKey('punctual')).toBe(true);
    expect(isReviewTagKey('Puntuale')).toBe(false);
    expect(isReviewTagKey(3)).toBe(false);
  });
});
