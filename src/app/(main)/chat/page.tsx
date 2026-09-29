'use client';

import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { useAuthStore } from '@/stores/authStore';
import { useConversations } from '@/hooks/useChat';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { conversationHref } from '@/lib/routes';
import { otherParticipant } from '@/lib/chat/ids';
import { formatChatTime, participantOf, previewText } from '@/lib/chat/format';
import { cn } from '@/lib/utils';

/** Chat inbox — every conversation of the signed-in user, newest first, live. */
export default function ChatInboxPage() {
  const { t, locale } = useI18n();
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const { conversations, state } = useConversations(uid);
  const localeTag = toLocaleTag(locale);

  return (
    <div className="container-mobile space-y-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-content">{t('chat.list.title')}</h1>
        <p className="text-sm text-text-secondary">{t('chat.list.subtitle')}</p>
      </header>

      {state === 'loading' && (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      )}

      {state === 'error' && (
        <p role="alert" className="rounded-2xl border border-hairline bg-surface-2 p-5 text-center text-sm text-text-secondary">
          {t('chat.list.error')}
        </p>
      )}

      {state === 'ready' && conversations.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-hairline bg-surface-2 p-8 text-center">
          <MessageCircle className="h-8 w-8 text-text-tertiary" aria-hidden="true" />
          <p className="font-semibold text-content">{t('chat.list.emptyTitle')}</p>
          <p className="text-sm text-text-secondary">{t('chat.list.emptyBody')}</p>
        </div>
      )}

      {state === 'ready' && conversations.length > 0 && (
        <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface-2">
          {conversations.map((conversation) => {
            const other = uid ? otherParticipant(conversation.id, uid) : null;
            const person = participantOf(conversation, other);
            const name = person.name || t('chat.unknownUser');
            const unread = (uid && conversation.unread?.[uid]) || 0;
            const last = conversation.lastMessage
              ? conversation.lastSenderId === uid
                ? t('chat.list.you', { text: previewText(conversation.lastMessage) })
                : previewText(conversation.lastMessage)
              : t('chat.list.noMessages');
            const when = conversation.lastMessageAt?.toDate();

            return (
              <li key={conversation.id}>
                <Link
                  href={conversationHref(conversation.id)}
                  className="flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:outline-none"
                >
                  <Avatar src={person.photoUrl} name={name} alt={name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn('truncate text-content', unread > 0 ? 'font-bold' : 'font-semibold')}>
                        {name}
                      </p>
                      {when && (
                        <time dateTime={when.toISOString()} className="shrink-0 text-xs text-text-tertiary">
                          {formatChatTime(when, localeTag)}
                        </time>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('truncate text-sm', unread > 0 ? 'text-content' : 'text-text-secondary')}>
                        {last}
                      </p>
                      {unread > 0 && (
                        <span
                          className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-section-primary px-1.5 text-xs font-bold text-black"
                          aria-label={t('chat.list.unreadAria', { count: unread })}
                        >
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
