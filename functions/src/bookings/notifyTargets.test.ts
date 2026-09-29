import { describe, it, expect } from "vitest";
import {
  cancellationTarget,
  newRequestTarget,
  pickTransitionNote,
  reminderContext,
  reminderKind,
} from "./notifyTargets";
import { buildMessage, SUPPORTED_LOCALES } from "../notifications/bookingMessages";

const booking = {
  userId: "client-1",
  instructorId: "trainer-1",
  userName: "Giulia Rossi",
  instructorName: "Marco Bianchi",
  serviceName: "Personal Training",
  venueName: null,
  scheduledAt: new Date("2026-10-05T08:00:00Z"),
};

describe("newRequestTarget (A1)", () => {
  it("addresses exactly one notification to the trainer, carrying the bookingId", () => {
    const t = newRequestTarget("bk-1", booking);
    expect(t).toMatchObject({
      recipientUid: "trainer-1",
      event: "new_request",
      bookingId: "bk-1",
      context: { serviceName: "Personal Training", clientName: "Giulia Rossi" },
    });
  });

  it("notifies nobody for a venue booking without a trainer, or a trainer booking themselves", () => {
    expect(newRequestTarget("bk-1", { ...booking, instructorId: null })).toBeNull();
    expect(newRequestTarget("bk-1", { ...booking, instructorId: "client-1" })).toBeNull();
  });

  it("renders the client, service and Rome-time start in every locale", () => {
    const t = newRequestTarget("bk-1", booking)!;
    for (const locale of SUPPORTED_LOCALES) {
      const m = buildMessage(t.event, locale, t.context);
      expect(m.title).toBeTruthy();
      expect(m.body).toContain("Giulia Rossi");
      expect(m.body).toContain("Personal Training");
      expect(m.body).toContain("10:00"); // 08:00Z is 10:00 in Rome (CEST)
      expect(m.body).not.toContain("undefined");
    }
  });
});

describe("cancellationTarget (A2)", () => {
  it("sends a client cancellation to the trainer, flagging it as late", () => {
    const t = cancellationTarget("bk-1", booking, { cancelledBy: "user", late: true });
    expect(t).toMatchObject({
      recipientUid: "trainer-1",
      event: "cancelled_by_client",
      bookingId: "bk-1",
      context: { late: true },
    });
    expect(buildMessage(t!.event, "it", t!.context).body).toContain("tardiva");
    expect(buildMessage(t!.event, "en", t!.context).body).toContain("Late cancellation");
  });

  it("does not mention lateness for an on-time cancellation", () => {
    const t = cancellationTarget("bk-1", booking, { cancelledBy: "user", late: false })!;
    expect(buildMessage(t.event, "en", t.context).body).not.toContain("Late");
  });

  it("sends a trainer or admin cancellation to the client, with the reason", () => {
    for (const cancelledBy of ["provider", "admin"] as const) {
      const t = cancellationTarget("bk-1", booking, { cancelledBy, late: false, reason: "Sono malato" })!;
      expect(t).toMatchObject({ recipientUid: "client-1", event: "cancelled_by_trainer" });
      expect(buildMessage(t.event, "it", t.context).body).toContain("Motivo: Sono malato");
    }
  });

  it("skips a client cancellation when there is no trainer to tell", () => {
    expect(cancellationTarget("bk-1", { ...booking, instructorId: null },
      { cancelledBy: "user", late: false })).toBeNull();
  });
});

describe("pickTransitionNote (A3)", () => {
  it("accepts both `note` and the legacy `reason`, preferring note", () => {
    expect(pickTransitionNote({ note: "da note" })).toBe("da note");
    expect(pickTransitionNote({ reason: "da reason" })).toBe("da reason");
    expect(pickTransitionNote({ note: "n", reason: "r" })).toBe("n");
    expect(pickTransitionNote({ note: "   ", reason: "r" })).toBe("r");
  });

  it("ignores blanks and non-strings and caps the length", () => {
    expect(pickTransitionNote({})).toBeUndefined();
    expect(pickTransitionNote(undefined)).toBeUndefined();
    expect(pickTransitionNote({ note: 42 })).toBeUndefined();
    expect(pickTransitionNote({ note: "x".repeat(600) })).toHaveLength(500);
  });

  it("puts the reason in the client's cancellation message in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const body = buildMessage("cancelled_by_trainer", locale, {
        serviceName: "Yoga",
        reason: pickTransitionNote({ reason: "Imprevisto" }),
      }).body;
      expect(body).toContain("Imprevisto");
    }
    expect(buildMessage("cancelled_by_trainer", "en", { serviceName: "Yoga" }).body)
      .not.toContain("Reason");
  });
});

describe("reminders (A6)", () => {
  it("picks the 24h and 2h windows once each", () => {
    expect(reminderKind(24, {})).toBe("reminder_24h");
    expect(reminderKind(24, { reminder24hSent: true })).toBeNull();
    expect(reminderKind(2, {})).toBe("reminder_2h");
    expect(reminderKind(2, { reminder2hSent: true })).toBeNull();
    expect(reminderKind(10, {})).toBeNull();
  });

  it("names the trainer for a trainer session with no venue, in the user's language", () => {
    const ctx = reminderContext({ serviceName: "Personal Training", venueName: null, instructorName: "Marco Bianchi" });
    expect(buildMessage("reminder_24h", "it", ctx).body)
      .toBe("Ricorda: domani hai Personal Training con Marco Bianchi.");
    expect(buildMessage("reminder_2h", "en", ctx).body)
      .toBe("Personal Training starts in 2 hours with Marco Bianchi.");
    for (const locale of SUPPORTED_LOCALES) {
      for (const ev of ["reminder_24h", "reminder_2h"] as const) {
        const body = buildMessage(ev, locale, ctx).body;
        expect(body).toContain("Marco Bianchi");
        expect(body).not.toMatch(/null|undefined/);
      }
    }
  });

  it("names the venue for a venue booking", () => {
    const ctx = reminderContext({ serviceName: "Spinning", venueName: "VFit Torino", instructorName: null });
    expect(buildMessage("reminder_24h", "it", ctx).body).toBe("Ricorda: domani hai Spinning presso VFit Torino.");
  });

  it("falls back to a neutral phrase with no names at all, and unknown locales to Italian", () => {
    expect(buildMessage("reminder_2h", "xx", {}).body).toBe("La tua sessione inizia tra 2 ore.");
  });
});
