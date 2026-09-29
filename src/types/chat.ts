import type { Timestamp } from 'firebase/firestore';

/**
 * Client ↔ trainer chat. Schema and write ownership: docs/database-schema.md ("Chat").
 * Rules: firestore.rules, CONVERSATIONS section.
 */

export interface ChatParticipant {
  name: string;
  photoUrl: string | null;
}

export interface Conversation {
  /** `${minUid}_${maxUid}` — see conversationIdFor. */
  id: string;
  participantIds: [string, string];
  participants: Record<string, ChatParticipant>;
  createdAt: Timestamp | null;
  lastMessageAt: Timestamp | null;
  lastMessage?: string | null;
  lastSenderId?: string | null;
  unread?: Record<string, number>;
  bookingId?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  /** null only for a local message the server has not stamped yet. */
  createdAt: Timestamp | null;
}

/** Max message length — mirrored by firestore.rules. */
export const CHAT_MESSAGE_MAX_LENGTH = 2000;
