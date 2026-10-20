import { beforeAll, describe, expect, it } from "vitest";
import { BOOKING_MESSAGES, SUPPORTED_LOCALES, buildMessage, type BookingMessageEvent } from "./bookingMessages";

const COURSE_EVENTS: BookingMessageEvent[] = ["waitlist_promoted", "waitlist_cleared", "instructor_changed"];
const startsAt = new Date("2099-10-12T16:00:00Z");

describe("course notification events", () => {
  it.each(COURSE_EVENTS)("%s exists in every supported locale", (event) => {
    for (const locale of SUPPORTED_LOCALES) expect(typeof BOOKING_MESSAGES[locale][event]).toBe("function");
  });
  it.each(COURSE_EVENTS.flatMap((event) => SUPPORTED_LOCALES.map((locale) => [event, locale] as const)))(
    "%s (%s) renders a title and a body that name the course", (event, locale) => {
      const message = buildMessage(event, locale, { serviceName: "Yoga", startsAt });
      expect(message.title.trim().length).toBeGreaterThan(0);
      expect(message.body).toContain("Yoga");
      expect(`${message.title} ${message.body}`).not.toMatch(/undefined|\bnull\b|NaN/);
    });
  it.each(COURSE_EVENTS)("%s has a different title in every locale", (event) => {
    const titles = SUPPORTED_LOCALES.map((locale) => buildMessage(event, locale, { serviceName: "Yoga" }).title);
    expect(new Set(titles).size).toBe(SUPPORTED_LOCALES.length);
  });
  it.each(["waitlist_promoted", "instructor_changed"] as const)("%s shows the lesson time, the others do not need it",
    (event) => {
      for (const locale of SUPPORTED_LOCALES) {
        expect(buildMessage(event, locale, { serviceName: "Yoga", startsAt }).body).toMatch(/\(.+\d{2}.+\)/);
        expect(buildMessage(event, locale, { serviceName: "Yoga" }).body).not.toContain("(");
      }
    });
  it("falls back to a neutral name instead of printing undefined", () => {
    for (const event of COURSE_EVENTS) {
      for (const locale of SUPPORTED_LOCALES) {
        expect(JSON.stringify(buildMessage(event, locale, {}))).not.toMatch(/undefined|\bnull\b/);
      }
    }
  });
  it("uses the agreed Italian copy", () => {
    expect(buildMessage("waitlist_promoted", "it", { serviceName: "Yoga" })).toEqual({
      title: "Posto liberato",
      body: "Si è liberato un posto per Yoga. Apri le tue prenotazioni per confermarlo; con pagamento online hai 30 minuti.",
    });
    expect(buildMessage("waitlist_cleared", "it", { serviceName: "Yoga" }).title).toBe("Lista d'attesa chiusa");
    expect(buildMessage("instructor_changed", "it", { serviceName: "Yoga" }).title).toBe("Istruttore cambiato");
  });
  it("renders the booking events that existed before unchanged", () => {
    expect(buildMessage("accepted", "it", { serviceName: "Yoga" }).title).toBe("Prenotazione accettata");
  });
});

describe("queueCourseNotification link", () => {
  let queue: typeof import("../courses/notifications").queueCourseNotification;
  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
    queue = (await import("../courses/notifications")).queueCourseNotification;
  });
  const linkFor = (uid: string, course: Parameters<typeof queue>[4]) => {
    const written: { path: string; data: Record<string, unknown> }[] = [];
    queue({ set: (ref, data) => written.push({ path: ref.path, data }) }, "e1", "waitlist_promoted", uid, course);
    expect(written).toHaveLength(1);
    expect(written[0].path).toMatch(/^courseNotifications\//);
    return written[0].data.link;
  };
  it("sends a provider of a venue course to the venue-scoped page", () => {
    expect(linkFor("p", { name: "Yoga", providerId: "p", venueId: "v" })).toBe("/provider/courses?venue=v");
  });
  it("keeps the plain page for an unlinked course or a null venue", () => {
    expect(linkFor("p", { name: "Yoga", providerId: "p" })).toBe("/provider/courses");
    expect(linkFor("p", { name: "Yoga", providerId: "p", venueId: null })).toBe("/provider/courses");
  });
  it("keeps customers on their bookings, venue course or not", () => {
    expect(linkFor("u", { name: "Yoga", providerId: "p", venueId: "v" })).toBe("/courses?tab=bookings");
    expect(linkFor("u", { name: "Yoga", providerId: "p" })).toBe("/courses?tab=bookings");
  });
});
