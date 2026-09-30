import { describe, it, expect } from "vitest";
import { SUPPORTED_LOCALES } from "../src/notifications/bookingMessages";
import {
  CLIENT_ADDED_MESSAGES,
  CLIENT_INVITE_EMAILS,
  buildClientAddedMessage,
  buildClientInviteEmail,
} from "../src/notifications/clientMessages";

describe("client messages", () => {
  it("cover every supported locale", () => {
    expect(Object.keys(CLIENT_ADDED_MESSAGES).sort()).toEqual([...SUPPORTED_LOCALES].sort());
    expect(Object.keys(CLIENT_INVITE_EMAILS).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it("name the trainer and never render undefined", () => {
    for (const l of SUPPORTED_LOCALES) {
      expect(buildClientAddedMessage(l, "Luca").body).toContain("Luca");
      const invite = buildClientInviteEmail(l, "Luca");
      expect(invite.subject).toContain("Luca");
      for (const text of [
        ...Object.values(buildClientAddedMessage(l, null)),
        ...Object.values(buildClientInviteEmail(l, undefined)),
      ]) {
        expect(text).not.toMatch(/undefined|null/);
        expect(text.trim()).not.toBe("");
      }
    }
  });

  it("falls back to Italian for an unknown locale", () => {
    expect(buildClientAddedMessage("pt", "Luca")).toEqual(buildClientAddedMessage("it", "Luca"));
  });
});
