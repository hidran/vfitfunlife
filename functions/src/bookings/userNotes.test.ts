import { describe, it, expect } from "vitest";
import { sanitizeUserNotes, USER_NOTES_MAX_LENGTH } from "./userNotes";

describe("sanitizeUserNotes", () => {
  it("keeps an ordinary note, trimmed", () => {
    expect(sanitizeUserNotes("  Ho mal di schiena, esercizi leggeri.  ")).toBe(
      "Ho mal di schiena, esercizi leggeri."
    );
  });

  it("turns missing, non-string and blank notes into null", () => {
    expect(sanitizeUserNotes(undefined)).toBeNull();
    expect(sanitizeUserNotes(null)).toBeNull();
    expect(sanitizeUserNotes(42)).toBeNull();
    expect(sanitizeUserNotes({ text: "x" })).toBeNull();
    expect(sanitizeUserNotes("   \n\t ")).toBeNull();
  });

  it("drops control characters but keeps newlines and tabs", () => {
    expect(sanitizeUserNotes("a\u0000b\u0007c\u007fd\u009be")).toBe("abcde");
    expect(sanitizeUserNotes("line 1\r\nline 2\rline 3\tend")).toBe("line 1\nline 2\nline 3\tend");
  });

  it("collapses runs of blank lines", () => {
    expect(sanitizeUserNotes("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("caps the note at the maximum length", () => {
    const out = sanitizeUserNotes("x".repeat(USER_NOTES_MAX_LENGTH + 200));
    expect(out).toHaveLength(USER_NOTES_MAX_LENGTH);
  });

  it("counts code points, never splitting an emoji", () => {
    const out = sanitizeUserNotes("💪".repeat(USER_NOTES_MAX_LENGTH + 5)) as string;
    expect(Array.from(out)).toHaveLength(USER_NOTES_MAX_LENGTH);
    expect(out.endsWith("💪")).toBe(true);
  });
});
