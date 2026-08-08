import { describe, it, expect } from "vitest";
import {
  BOOKING_MESSAGES,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  resolveLocale,
  buildMessage,
  type BookingMessageEvent,
} from "../src/notifications/bookingMessages";

describe("resolveLocale", () => {
  it("returns the locale when supported", () => {
    for (const l of SUPPORTED_LOCALES) expect(resolveLocale(l)).toBe(l);
  });

  it("falls back to Italian for an unsupported locale", () => {
    expect(resolveLocale("pt")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("zh-Hans")).toBe(DEFAULT_LOCALE);
  });

  it("falls back to Italian for absent or malformed input", () => {
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(42 as unknown as string)).toBe(DEFAULT_LOCALE);
  });

  it("defaults to Italian, the pilot's primary language", () => {
    expect(DEFAULT_LOCALE).toBe("it");
  });
});

describe("BOOKING_MESSAGES catalog", () => {
  it("covers all five locales", () => {
    expect(Object.keys(BOOKING_MESSAGES).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it("has identical event keys in every locale", () => {
    const italianKeys = Object.keys(BOOKING_MESSAGES.it).sort();
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(BOOKING_MESSAGES[locale]).sort(), `locale ${locale}`).toEqual(italianKeys);
    }
  });

  it("produces a non-empty title and body for every event in every locale", () => {
    const ctx = { serviceName: "Personal Training", trainerName: "Marco", amount: 45, clientName: "Anna" };
    for (const locale of SUPPORTED_LOCALES) {
      for (const event of Object.keys(BOOKING_MESSAGES[locale]) as BookingMessageEvent[]) {
        const m = buildMessage(event, locale, ctx);
        expect(m.title.length, `${locale}/${event} title`).toBeGreaterThan(0);
        expect(m.body.length, `${locale}/${event} body`).toBeGreaterThan(0);
      }
    }
  });
});

describe("buildMessage", () => {
  it("interpolates the service name", () => {
    const m = buildMessage("accepted", "it", { serviceName: "Yoga" });
    expect(m.body).toContain("Yoga");
  });

  it("formats the amount in the payment_confirmed message", () => {
    const m = buildMessage("payment_confirmed", "it", { serviceName: "Yoga", amount: 45 });
    expect(m.body).toMatch(/45/);
  });

  it("falls back to the default locale for an unknown one", () => {
    const unknown = buildMessage("accepted", "pt", { serviceName: "Yoga" });
    const italian = buildMessage("accepted", "it", { serviceName: "Yoga" });
    expect(unknown).toEqual(italian);
  });

  it("degrades gracefully when context fields are missing", () => {
    const m = buildMessage("accepted", "it", {});
    expect(m.body.length).toBeGreaterThan(0);
    expect(m.body).not.toContain("undefined");
  });
});
