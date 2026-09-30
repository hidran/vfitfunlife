import { describe, it, expect } from "vitest";
import { SUPPORTED_LOCALES } from "./bookingMessages";
import {
  CLIENT_ACCOUNT_EMAILS,
  CLIENT_ADDED_MESSAGES,
  CLIENT_INVITE_EMAILS,
  buildClientAccountEmail,
} from "./clientMessages";

describe("client messages", () => {
  it("cover every supported locale", () => {
    for (const map of [CLIENT_ADDED_MESSAGES, CLIENT_INVITE_EMAILS, CLIENT_ACCOUNT_EMAILS]) {
      expect(Object.keys(map).sort()).toEqual([...SUPPORTED_LOCALES].sort());
    }
  });

  it.each([...SUPPORTED_LOCALES])("account email (%s) names trainer and client, mentions Google", (locale) => {
    const m = CLIENT_ACCOUNT_EMAILS[locale]("Marco Bianchi", "Luca");
    expect(m.subject).toContain("Marco Bianchi");
    expect(m.subject).toContain("VFit");
    expect(m.body).toContain("Marco Bianchi");
    expect(m.body).toContain("Luca");
    expect(m.body).toContain("Google");
    expect(m.actionLabel.trim().length).toBeGreaterThan(0);
    expect(`${m.subject} ${m.body}`).not.toMatch(/undefined|null/);
  });

  it.each([...SUPPORTED_LOCALES])("account email (%s) never renders a missing trainer name", (locale) => {
    const m = CLIENT_ACCOUNT_EMAILS[locale](null, "Luca");
    expect(`${m.subject} ${m.body}`).not.toMatch(/undefined|null/);
    expect(m.subject.trim().length).toBeGreaterThan(0);
  });

  it("falls back to Italian for an unknown locale", () => {
    expect(buildClientAccountEmail("pt", "Marco", "Luca")).toEqual(CLIENT_ACCOUNT_EMAILS.it("Marco", "Luca"));
    expect(buildClientAccountEmail("de", "Marco", "Luca").actionLabel).toBe("Konto bestätigen");
  });
});
