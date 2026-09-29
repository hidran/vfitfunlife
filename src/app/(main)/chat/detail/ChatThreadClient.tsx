'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, Calendar, RotateCcw, Send } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { useAuthStore } from '@/stores/authStore';
import { useChatThread, type ThreadMessage } from '@/hooks/useChat';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { CHAT_INBOX_PATH } from '@/lib/routes';
import { conversationIdFor, otherParticipant } from '@/lib/chat/ids';
import { formatChatTime, participantOf } from '@/lib/chat/format';
import { fetchPublicParticipant } from '@/lib/firebase/chat';
import { CHAT_MESSAGE_MAX_LENGTH, type ChatParticipant } from '@/types/chat';
import { cn } from '@/lib/utils';

/** Show the character counter once a message gets this long. */
const COUNTER_THRESHOLD = CHAT_MESSAGE_MAX_LENGTH - 200;

/** useSearchParams can hydrate empty on the first render under `output: 'export'`. */
function readParam(searchParams: { get(name: string): string | null } | null, name: string): string | null {
  const fromHook = searchParams?.get(name);
  if (fromHook) return fromHook;
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name) || null;
}

export default function ChatThreadClient() {
  const { t, locale } = useI18n();
  const localeTag = toLocaleTag(locale);
  const searchParams = useSearchParams();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const user = useAuthStore((s) => s.user);
  const me = firebaseUser?.uid;

  const idParam = readParam(searchParams, 'id');
  const withParam = readParam(searchParams, 'with');
  const nameHint = readParam(searchParams, 'name');
  const photoHint = readParam(searchParams, 'photo');
  const bookingId = readParam(searchParams, 'booking') ?? undefined;

  // Resolve the thread: `?with=<uid>` derives the deterministic id; `?id=` is taken as is.
  const { conversationId, other } = useMemo(() => {
    if (!me) return { conversationId: null, other: null };
    if (withParam) {
      if (withParam === me) return { conversationId: null, other: null };
      return { conversationId: conversationIdFor(me, withParam), other: withParam };
    }
    if (idParam) {
      const o = otherParticipant(idParam, me);
      return o ? { conversationId: idParam, other: o } : { conversationId: null, other: null };
    }
    return { conversationId: null, other: null };
  }, [me, withParam, idParam]);

  // Other side's public info when the link carried no hint (first contact from a profile).
  const [fetchedOther, setFetchedOther] = useState<ChatParticipant | null>(null);
  useEffect(() => {
    if (!other || nameHint) return;
    let cancelled = false;
    void fetchPublicParticipant(other).then((p) => {
      if (!cancelled) setFetchedOther(p);
    });
    return () => {
      cancelled = true;
    };
  }, [other, nameHint]);

  const participants = useMemo<Record<string, ChatParticipant>>(() => {
    if (!me || !other) return {};
    return {
      [me]: {
        name: user?.fullName || firebaseUser?.displayName || '',
        photoUrl: user?.avatarUrl || firebaseUser?.photoURL || null,
      },
      [other]: {
        name: nameHint || fetchedOther?.name || '',
        photoUrl: photoHint || fetchedOther?.photoUrl || null,
      },
    };
  }, [me, other, user, firebaseUser, nameHint, photoHint, fetchedOther]);

  const { conversation, state, messages, send, retry } = useChatThread({
    conversationId,
    me,
    other,
    participants,
    bookingId,
  });

  const stored = participantOf(conversation, other);
  const otherName = stored.name || participants[other ?? '']?.name || t('chat.unknownUser');
  const otherPhoto = stored.photoUrl || participants[other ?? '']?.photoUrl || null;
  const threadBookingId = conversation?.bookingId ?? bookingId;
  const isProvider = user?.role === 'provider';

  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = () => {
    if (send(draft)) setDraft('');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter breaks the line; never while an IME is composing.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  if (me && !conversationId) {
    return (
      <div className="container-mobile space-y-4 py-10 text-center">
        <p role="alert" className="text-sm text-text-secondary">{t('chat.thread.notFound')}</p>
        <Link href={CHAT_INBOX_PATH} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-section-primary">
          {t('chat.thread.back')}
        </Link>
      </div>
    );
  }

  const quickReplies = [
    t('chat.quickReply.confirmTime'),
    t('chat.quickReply.bringFriend'),
    t('chat.quickReply.materials'),
  ];
  const trimmedLength = draft.trim().length;

  return (
    // Fills the viewport between the fixed header (56px) and the tab bar (80px incl. padding).
    <div
      className="mx-auto flex max-w-3xl flex-col"
      style={{
        height:
          'calc(100dvh - var(--safe-area-inset-top) - 56px - var(--safe-area-inset-bottom) - 80px)',
      }}
    >
      <header className="flex items-center gap-3 border-b border-hairline px-2 py-2">
        <Link
          href={CHAT_INBOX_PATH}
          aria-label={t('chat.thread.back')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface-2"
        >
          <ArrowLeft className="h-5 w-5 text-content" aria-hidden="true" />
        </Link>
        <Avatar src={otherPhoto} name={otherName} alt={otherName} size="sm" />
        <h1 className="min-w-0 flex-1 truncate font-semibold text-content">{otherName}</h1>
        {threadBookingId && !isProvider && (
          <Link
            href={`/bookings/detail?id=${encodeURIComponent(threadBookingId)}`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-text-secondary transition-colors hover:text-content"
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            {t('chat.thread.viewBooking')}
          </Link>
        )}
      </header>

      <div
        role="log"
        aria-live="polite"
        aria-label={t('chat.thread.messagesAria')}
        className="flex-1 space-y-2 overflow-y-auto px-4 py-4"
      >
        {state === 'loading' && (
          <div className="flex justify-center py-10">
            <Spinner size="md" />
          </div>
        )}

        {state === 'error' && (
          <p role="alert" className="rounded-2xl border border-hairline bg-surface-2 p-4 text-center text-sm text-text-secondary">
            {t('chat.thread.error')}
          </p>
        )}

        {state === 'ready' && messages.length === 0 && (
          <div className="space-y-4 py-6 text-center">
            <p className="text-sm text-text-secondary">{t('chat.thread.empty')}</p>
            {!isProvider && (
              <div className="flex flex-wrap justify-center gap-2">
                {quickReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => setDraft(reply)}
                    className="min-h-[44px] rounded-full border border-content/20 px-4 text-sm text-text-secondary transition-colors hover:text-content"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            mine={message.senderId === me}
            localeTag={localeTag}
            onRetry={() => retry(message.id)}
            labels={{
              sending: t('chat.message.sending'),
              failed: t('chat.message.failed'),
              retry: t('chat.message.retry'),
            }}
          />
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="border-t border-hairline bg-background-dark/95 px-3 py-3">
        <div className="flex items-end gap-2">
          <label htmlFor="chat-draft" className="sr-only">
            {t('chat.input.label')}
          </label>
          <textarea
            id="chat-draft"
            rows={1}
            value={draft}
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('chat.input.placeholder')}
            aria-describedby={draft.length > COUNTER_THRESHOLD ? 'chat-draft-counter' : undefined}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-content/15 bg-surface-sunken px-3 py-2.5 text-base text-content outline-none transition-colors focus:border-[var(--section-primary)] sm:text-sm"
          />
          <button
            type="submit"
            disabled={trimmedLength === 0 || state === 'loading'}
            aria-label={t('chat.send.aria')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--section-primary)] text-black transition-opacity disabled:opacity-40"
          >
            <Send className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {draft.length > COUNTER_THRESHOLD && (
          <p id="chat-draft-counter" className="mt-1 text-right text-xs text-text-tertiary">
            {t('chat.input.counter', { count: draft.length, max: CHAT_MESSAGE_MAX_LENGTH })}
          </p>
        )}
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  localeTag,
  onRetry,
  labels,
}: {
  message: ThreadMessage;
  mine: boolean;
  localeTag: string;
  onRetry: () => void;
  labels: { sending: string; failed: string; retry: string };
}) {
  const when = message.createdAt?.toDate();
  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm',
          mine
            ? 'rounded-br-md bg-[var(--section-primary)] text-black'
            : 'rounded-bl-md border border-hairline bg-surface-2 text-content',
          message.status === 'failed' && 'opacity-60',
        )}
      >
        {message.text}
      </div>
      <p className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-text-tertiary">
        {message.status === 'sending' && <span>{labels.sending}</span>}
        {message.status === 'sent' && when && (
          <time dateTime={when.toISOString()}>{formatChatTime(when, localeTag)}</time>
        )}
        {message.status === 'failed' && (
          <>
            <AlertCircle className="h-3.5 w-3.5 text-error" aria-hidden="true" />
            <span className="text-error">{labels.failed}</span>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-[44px] items-center gap-1 px-2 font-semibold text-content underline"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {labels.retry}
            </button>
          </>
        )}
      </p>
    </div>
  );
}
