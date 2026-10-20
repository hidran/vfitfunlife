import type { MessageKey } from '@/i18n/messages';
import type { TranslateValues } from '@/contexts/I18nContext';

/**
 * Every code a course, waitlist or venue-space callable can throw (HttpsError message). Each one has a
 * `courses.err.<code>` string in the five locales; `price_changed` also has `_price` and `_availability` variants.
 * Business-account codes (`provider_type_locked`, `venue_exists`, ...) come from the provider application flow and are
 * worded there, so they are not listed here.
 */
export const COURSE_ERROR_CODES = [
  'venue_authorization_required', 'venue_not_active', 'venue_owner_required', 'invalid_space', 'invalid_instructor',
  'room_overlap', 'instructor_overlap', 'locked_schedule_too_long', 'price_changed', 'expected_price_required',
  'lesson_full', 'already_waitlisted', 'waitlist_disabled', 'waitlist_full', 'waitlist_not_open',
  'course_instructor_not_allowed', 'checkout_amount_too_low', 'online_payments_disabled', 'rate_limited',
  'course_owner_required', 'account_inactive', 'course_not_found', 'session_not_found', 'enrollment_not_found',
  'enrollment_owner_required', 'already_enrolled', 'request_id_reused', 'invalid_booking_option',
  'session_not_in_course', 'too_many_sessions', 'capacity_below_bookings', 'invalid_capacity',
  'booked_schedule_locked', 'provider_unavailable', 'provider_client_required', 'cannot_book_yourself',
  'enrollment_closed', 'booking_deadline', 'cancellation_deadline', 'cannot_cancel_past_lesson',
  'cannot_change_past_lesson', 'start_must_be_future', 'reason_required', 'series_already_started',
  'session_unavailable', 'pricing_option_unavailable', 'direct_payment_required', 'direct_refund_required',
  'direct_confirmed_enrollment_required', 'checkout_hold_unavailable', 'verified_instructor_required',
  'invalid_instructor_partnership', 'invalid_local_time', 'ambiguous_local_time', 'schedule_too_long',
  'empty_schedule', 'invalid_timezone', 'pricing_required', 'participant_not_found', 'refund_not_found',
  'admin_required', 'phone_required', 'email_required', 'invalid_payment_method', 'gym_not_found',
  'gym_location_not_found', 'active_leaf_required',
] as const;
export type CourseErrorCode = (typeof COURSE_ERROR_CODES)[number];

// The one server message that is a sentence rather than a code (checkout/enroll/waitlist when Stripe is switched off).
const SENTENCES: Record<string, CourseErrorCode> = { 'Online course payments are not enabled': 'online_payments_disabled' };

type Translate = (key: MessageKey, values?: TranslateValues) => string;
type Details = { courseName?: string; startsAt?: string; reason?: string; minCents?: number } | undefined;

const isCode = (value: string): value is CourseErrorCode => (COURSE_ERROR_CODES as readonly string[]).includes(value);
const key = (suffix: string) => `courses.err.${suffix}` as MessageKey;

function formatTime(iso: string | undefined, locale?: string): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatMoney(cents: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/**
 * Translated text for an error thrown by a course callable. Reads `message` and `details` of a Firebase callable error
 * (`details`: overlaps carry the conflicting course and time, `price_changed` a reason, `checkout_amount_too_low` the
 * minimum). Unknown or non-error values fall back to the generic `courses.error`. `locale` formats the overlap time
 * (defaults to the browser's).
 */
export function courseErrorMessage(err: unknown, t: Translate, locale?: string): string {
  const raw = err instanceof Error ? err.message : typeof err === 'object' && err !== null ?
    (err as { message?: unknown }).message : undefined;
  const message = typeof raw === 'string' ? raw : '';
  const code = SENTENCES[message] ?? message;
  if (!isCode(code)) return t('courses.error');
  const details = (err as { details?: Details }).details;
  switch (code) {
    case 'room_overlap':
    case 'instructor_overlap':
      return t(key(code), { name: details?.courseName ?? '', time: formatTime(details?.startsAt, locale) });
    case 'price_changed':
      return t(details?.reason === 'price' ? key('price_changed_price') : details?.reason === 'availability' ?
        key('price_changed_availability') : key('price_changed'));
    case 'checkout_amount_too_low':
      return t(key(code), { min: formatMoney(details?.minCents ?? 50, locale) });
    default:
      return t(key(code));
  }
}
