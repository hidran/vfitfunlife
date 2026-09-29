/**
 * Deterministic conversation ids: the two participant uids, sorted, joined by `_`.
 * firestore.rules checks exactly this shape on create, so a pair can only ever have one
 * conversation and every "Message" button lands on the same thread.
 */
export function conversationIdFor(uidA: string, uidB: string): string {
  const [a, b] = sortedParticipants(uidA, uidB);
  return `${a}_${b}`;
}

export function sortedParticipants(uidA: string, uidB: string): [string, string] {
  // Plain code-unit comparison — the same ordering as the rules' `ids[0] < ids[1]`.
  return uidA < uidB ? [uidA, uidB] : [uidB, uidA];
}

/** The other participant of a conversation id, or null when `me` is not part of it. */
export function otherParticipant(conversationId: string, me: string): string | null {
  const parts = conversationId.split('_');
  if (parts.length !== 2 || !parts.includes(me)) return null;
  return parts[0] === me ? parts[1] : parts[0];
}
