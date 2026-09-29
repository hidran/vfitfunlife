import type { ChatParticipant, Conversation } from '@/types/chat';

/**
 * Inbox / bubble timestamp: the time for today, the weekday within the last 6 days, the
 * date otherwise.
 */
export function formatChatTime(date: Date, localeTag: string, now: Date = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) {
    return date.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' });
  }
  if (days < 7) {
    return date.toLocaleDateString(localeTag, { weekday: 'short' });
  }
  return date.toLocaleDateString(localeTag, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** Bubble time: always hour:minute (the day is implied by the thread). */
export function formatMessageTime(date: Date, localeTag: string): string {
  return date.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' });
}

/** Name/photo of `uid` as stored on the conversation, with an empty-name fallback. */
export function participantOf(
  conversation: Pick<Conversation, 'participants'> | null | undefined,
  uid: string | null | undefined,
): ChatParticipant {
  const entry = uid ? conversation?.participants?.[uid] : undefined;
  return {
    name: typeof entry?.name === 'string' ? entry.name.trim() : '',
    photoUrl: typeof entry?.photoUrl === 'string' && entry.photoUrl ? entry.photoUrl : null,
  };
}

/** One-line inbox preview of the last message. */
export function previewText(text: string | null | undefined, max = 80): string {
  const oneLine = (text ?? '').replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}
