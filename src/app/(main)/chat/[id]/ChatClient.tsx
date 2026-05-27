'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send, Sparkles } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';

interface ChatMessage {
  id: string;
  sender: 'user' | 'provider';
  text: string;
  sentAt: string;
}

export default function ChatClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();
  const providerId = params.id;

  const QUICK_REPLIES = [
    t('chat.quickReply.confirmTime'),
    t('chat.quickReply.bringFriend'),
    t('chat.quickReply.materials'),
  ];

  const initialMessages = useMemo<ChatMessage[]>(
    () => [
      {
        id: 'm1',
        sender: 'provider',
        text: 'Ciao! Ho ricevuto la tua prenotazione. Ti aspetto in struttura.',
        sentAt: '09:12',
      },
      {
        id: 'm2',
        sender: 'user',
        text: 'Perfetto, grazie! Ti confermo che arrivo 10 minuti prima.',
        sentAt: '09:14',
      },
    ],
    []
  );

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;

    const now = new Date();
    const sentAt = now.toLocaleTimeString(toLocaleTag(locale), {
      hour: '2-digit',
      minute: '2-digit',
    });

    setMessages((prev) => [
      ...prev,
      {
        id: `${providerId}-${prev.length + 1}`,
        sender: 'user',
        text,
        sentAt,
      },
    ]);
    setDraft('');
  };

  const sendQuickReply = (text: string) => {
    setDraft(text);
  };

  return (
    <div className="min-h-screen bg-background-dark">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-background-dark/95 backdrop-blur-md">
        <div className="flex items-center gap-3 p-4">
          <button
            onClick={() => router.back()}
            className="rounded-full p-2 transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <Avatar name="Provider" size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-white">{t('chat.header.title')}</p>
            <p className="text-xs text-text-tertiary">{t('chat.header.providerId', { id: providerId })}</p>
          </div>
          <Link
            href="/bookings"
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:text-white"
          >
            {t('chat.header.bookings')}
          </Link>
        </div>
      </div>

      <div className="space-y-4 p-4 pb-40">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="flex items-center gap-2 text-xs text-text-secondary">
            <Sparkles className="h-4 w-4 text-[var(--section-primary)]" />
            {t('chat.hint')}
          </p>
        </div>

        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
                message.sender === 'user'
                  ? 'ml-auto rounded-br-md bg-[var(--section-primary)] text-white'
                  : 'rounded-bl-md border border-white/10 bg-white/5 text-text-secondary'
              )}
            >
              <p>{message.text}</p>
              <p
                className={cn(
                  'mt-1 text-[11px]',
                  message.sender === 'user' ? 'text-white/80' : 'text-text-tertiary'
                )}
              >
                {message.sentAt}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_REPLIES.map((reply) => (
            <button
              key={reply}
              onClick={() => sendQuickReply(reply)}
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-white"
            >
              {reply}
            </button>
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-background-dark/95 p-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('chat.input.placeholder')}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--section-primary)]"
          />
          <Button onClick={handleSend} disabled={!draft.trim()} aria-label={t('chat.send.aria')} className="h-11 px-4">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
