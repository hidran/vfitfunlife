/**
 * The note a client leaves the trainer when booking ("I have a sore back", "bring a mat").
 *
 * The booking screen caps it at the same length, but the callable is the only enforcement
 * that counts: a hand-made request could otherwise store a megabyte of text (or control
 * characters) on a document the trainer's screens render in full.
 */
export const USER_NOTES_MAX_LENGTH = 500;

// C0 controls except tab (\x09) and newline (\x0A), plus DEL and the C1 range.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/g;

/**
 * Normalises a client-supplied booking note: non-strings and blank notes become null,
 * line endings are unified, control characters dropped, runs of blank lines collapsed,
 * and the result is capped at {@link USER_NOTES_MAX_LENGTH} characters (by code point, so
 * an emoji is never cut in half).
 */
export function sanitizeUserNotes(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return null;
  const chars = Array.from(cleaned);
  if (chars.length <= USER_NOTES_MAX_LENGTH) return cleaned;
  return chars.slice(0, USER_NOTES_MAX_LENGTH).join("").trimEnd();
}
