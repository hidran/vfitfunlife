import type { MessageKey } from '@/i18n/messages';

/**
 * Callable failures, mapped to what the user should read. A callable rejects with a
 * FirebaseError whose `code` is `functions/<status>` and whose `message` is the server's.
 */
function callableError(err: unknown): { code: string; message: string } {
  const e = (typeof err === 'object' && err !== null ? err : {}) as { code?: unknown; message?: unknown };
  return { code: String(e.code ?? ''), message: String(e.message ?? '') };
}

/** Why updateMyAvailability refused a save. */
export function availabilitySaveErrorKey(err: unknown): MessageKey {
  const { code } = callableError(err);
  if (code === 'functions/invalid-argument') return 'provider.availability.error.invalid';
  if (code === 'functions/failed-precondition') return 'provider.availability.error.noProfile';
  return 'provider.availability.error.save';
}

/**
 * Which weekday (0 = Sunday … 6 = Saturday, matching WeeklyWindow.dayOfWeek) an
 * updateMyAvailability rejection is about, when the server's message says — the overlap and
 * "too many windows" checks in functions/src/availability/validate.ts report a day this way;
 * a malformed window's own message does not name one. Null falls back to the generic message.
 */
export function dayOfWeekFromError(err: unknown): number | null {
  const { message } = callableError(err);
  const m = /^day (\d+):/.exec(message);
  return m ? Number(m[1]) : null;
}

/** createBooking's refusal of a start that is outside the provider's hours or already taken. */
export function isSlotUnavailableError(err: unknown): boolean {
  const { code, message } = callableError(err);
  return code === 'functions/failed-precondition' && message === 'slot_unavailable';
}
