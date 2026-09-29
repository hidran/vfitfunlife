'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  markConversationRead,
  newMessageId,
  sendChatMessage,
  subscribeToConversation,
  subscribeToConversations,
  subscribeToMessages,
} from '@/lib/firebase/chat';
import type { ChatMessage, ChatParticipant, Conversation } from '@/types/chat';
import { CHAT_MESSAGE_MAX_LENGTH } from '@/types/chat';

type LoadState = 'loading' | 'ready' | 'error';

// Listener results are stored together with the key they were fetched for, and anything
// keyed to another uid/conversation reads as "loading". That resets state on a key change
// without a synchronous setState in the effect body.

/** Realtime inbox of the signed-in user. */
export function useConversations(uid: string | undefined) {
  const [snapshot, setSnapshot] = useState<{
    uid: string;
    conversations: Conversation[];
    state: 'ready' | 'error';
  } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return subscribeToConversations(
      uid,
      (conversations) => setSnapshot({ uid, conversations, state: 'ready' }),
      (err) => {
        console.error('[chat] inbox listener failed', err);
        setSnapshot({ uid, conversations: [], state: 'error' });
      },
    );
  }, [uid]);

  const current = snapshot && snapshot.uid === uid ? snapshot : null;
  return {
    conversations: current?.conversations ?? [],
    state: (current?.state ?? 'loading') as LoadState,
  };
}

export type ThreadMessageStatus = 'sent' | 'sending' | 'failed';
export interface ThreadMessage extends ChatMessage {
  status: ThreadMessageStatus;
}

interface OutboxEntry {
  conversationId: string;
  id: string;
  text: string;
  /** 'sent' = acknowledged by the server; shown until the listener delivers it. */
  status: ThreadMessageStatus;
}

interface ConversationSnapshot {
  conversationId: string;
  conversation: Conversation | null;
  /** Latched true once the doc exists server-side. */
  committed: boolean;
  error: boolean;
}

interface MessagesSnapshot {
  conversationId: string;
  messages: Array<ChatMessage & { pending: boolean }>;
  error: boolean;
}

/**
 * Realtime thread + optimistic send.
 *
 * A sent message shows immediately from the local outbox ("sending"), is replaced by the
 * Firestore copy once the listener has it, and turns "failed" (with retry, same id — no
 * duplicate) if the write is refused. The conversation doc is created in the same batch as
 * the first message when it does not exist yet.
 */
export function useChatThread(opts: {
  conversationId: string | null;
  me: string | undefined;
  other: string | null;
  /** Participant info written on first contact. */
  participants: Record<string, ChatParticipant>;
  bookingId?: string;
}) {
  const { conversationId, me, other, participants, bookingId } = opts;
  const [convSnap, setConvSnap] = useState<ConversationSnapshot | null>(null);
  const [msgSnap, setMsgSnap] = useState<MessagesSnapshot | null>(null);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);

  // Conversation doc.
  useEffect(() => {
    if (!conversationId || !me) return;
    return subscribeToConversation(
      conversationId,
      (conversation, isCommitted) =>
        setConvSnap((prev) => ({
          conversationId,
          conversation,
          // Latch: once the server has it, a later pending write (our unread reset) must
          // not tear down the messages listener.
          committed: isCommitted || (prev?.conversationId === conversationId && prev.committed),
          error: false,
        })),
      (err) => {
        console.error('[chat] conversation listener failed', err);
        setConvSnap({ conversationId, conversation: null, committed: false, error: true });
      },
    );
  }, [conversationId, me]);

  const conv = convSnap && convSnap.conversationId === conversationId ? convSnap : null;
  const conversation = conv?.conversation ?? null;
  const committed = conv?.committed ?? false;

  // Messages — only once the conversation exists server-side (the rule reads it).
  useEffect(() => {
    if (!conversationId || !committed) return;
    return subscribeToMessages(
      conversationId,
      (messages) => setMsgSnap({ conversationId, messages, error: false }),
      (err) => {
        console.error('[chat] messages listener failed', err);
        setMsgSnap({ conversationId, messages: [], error: true });
      },
    );
  }, [conversationId, committed]);

  const msgs = msgSnap && msgSnap.conversationId === conversationId ? msgSnap : null;

  // Read receipt: whenever my unread counter is non-zero while the thread is on screen.
  const myUnread = (me && conversation?.unread?.[me]) || 0;
  useEffect(() => {
    if (!conversationId || !me || myUnread <= 0) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    markConversationRead(conversationId, me).catch((err) =>
      console.warn('[chat] mark read failed', err),
    );
  }, [conversationId, me, myUnread]);

  const deliver = useCallback(
    async (id: string, text: string) => {
      if (!conversationId || !me || !other) return;
      const setStatus = (status: ThreadMessageStatus) =>
        setOutbox((prev) =>
          prev.some((e) => e.id === id)
            ? prev.map((e) => (e.id === id ? { ...e, status } : e))
            : [...prev, { conversationId, id, text, status }],
        );
      setStatus('sending');
      try {
        await sendChatMessage({
          conversationId,
          messageId: id,
          senderId: me,
          text,
          create: conversation
            ? undefined
            : { me, other, participants, ...(bookingId ? { bookingId } : {}) },
        });
        setStatus('sent');
      } catch (err) {
        console.error('[chat] send failed', err);
        setStatus('failed');
      }
    },
    [conversationId, me, other, participants, bookingId, conversation],
  );

  const send = useCallback(
    (raw: string): boolean => {
      const text = raw.trim();
      if (!conversationId || !text || text.length > CHAT_MESSAGE_MAX_LENGTH) return false;
      void deliver(newMessageId(conversationId), text);
      return true;
    },
    [conversationId, deliver],
  );

  const retry = useCallback(
    (id: string) => {
      const entry = outbox.find((e) => e.id === id);
      if (entry) void deliver(entry.id, entry.text);
    },
    [outbox, deliver],
  );

  const messages = useMemo<ThreadMessage[]>(() => {
    const serverMessages = msgs?.messages ?? [];
    const local = outbox.filter((e) => e.conversationId === conversationId);
    // A failed write can linger in the snapshot as a rolled-back pending doc: the outbox
    // entry wins so it shows once, as failed.
    const failedIds = new Set(local.filter((e) => e.status === 'failed').map((e) => e.id));
    const fromServer: ThreadMessage[] = serverMessages
      .filter((m) => !failedIds.has(m.id))
      .map((m) => ({
        id: m.id,
        senderId: m.senderId,
        text: m.text,
        createdAt: m.createdAt,
        status: m.pending ? 'sending' : 'sent',
      }));
    const seen = new Set(fromServer.map((m) => m.id));
    const pendingLocal: ThreadMessage[] = local
      .filter((e) => !seen.has(e.id))
      .map((e) => ({
        id: e.id,
        senderId: me ?? '',
        text: e.text,
        createdAt: null,
        // Acknowledged but not yet delivered by the listener: still "sending" to the eye.
        status: e.status === 'failed' ? 'failed' : 'sending',
      }));
    return [...fromServer, ...pendingLocal];
  }, [msgs, outbox, conversationId, me]);

  const state: LoadState = conv?.error || msgs?.error ? 'error' : conv ? 'ready' : 'loading';

  return {
    conversation,
    /** 'loading' until the first conversation snapshot; 'ready' also when it does not exist. */
    state,
    messages,
    send,
    retry,
  };
}
