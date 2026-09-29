import { describe, it, expect, vi, beforeEach } from "vitest";

// notify.ts calls admin.firestore() at import time; replace it with an in-memory fake that
// records inbox writes, and stub the push and email channels.
const h = vi.hoisted(() => ({
  users: {} as Record<string, Record<string, unknown> | undefined>,
  inbox: [] as { uid: string; doc: Record<string, unknown> }[],
  failInbox: false,
}));

vi.mock("firebase-admin", () => {
  const firestore = () => ({
    collection: () => ({
      doc: (uid: string) => ({
        get: async () => ({ data: () => h.users[uid] }),
        collection: () => ({
          add: async (doc: Record<string, unknown>) => {
            if (h.failInbox) throw new Error("firestore down");
            h.inbox.push({ uid, doc });
            return { id: `n${h.inbox.length}` };
          },
        }),
      }),
    }),
  });
  return { firestore, default: { firestore } };
});
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "SERVER_TS" },
}));
vi.mock("../notifications", () => ({ sendPushToUser: vi.fn(async () => undefined) }));
vi.mock("../lib/email", () => ({ sendEmail: vi.fn(async () => true) }));

import { notifyTransition } from "./notify";
import { newRequestTarget } from "./notifyTargets";
import { sendPushToUser } from "../notifications";
import { sendEmail } from "../lib/email";

beforeEach(() => {
  // The fake ignores collection names, so the booking doc lives in the same map.
  h.users = {
    "trainer-1": { email: "t@example.com", preferredLanguage: "en" },
    "bk-1": { instructorId: "trainer-1" },
  };
  h.inbox = [];
  h.failInbox = false;
  vi.mocked(sendPushToUser).mockClear();
  vi.mocked(sendEmail).mockClear();
});

describe("notifyTransition for a new booking request (A1)", () => {
  it("writes one inbox notification to the trainer with the bookingId, plus push and email", async () => {
    const target = newRequestTarget("bk-1", {
      userId: "client-1",
      instructorId: "trainer-1",
      userName: "Giulia",
      serviceName: "Yoga",
    })!;
    await notifyTransition(target);

    expect(h.inbox).toHaveLength(1);
    expect(h.inbox[0]).toMatchObject({
      uid: "trainer-1",
      doc: {
        title: "New booking request",
        type: "booking_new_request",
        data: { bookingId: "bk-1" },
        isRead: false,
      },
    });
    expect(h.inbox[0].doc.body).toContain("Giulia requested Yoga");
    expect(sendPushToUser).toHaveBeenCalledWith("trainer-1", expect.objectContaining({
      data: {
        bookingId: "bk-1",
        type: "booking_new_request",
        link: "/provider/bookings/detail?id=bk-1",
      },
    }));
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("never throws when a channel fails", async () => {
    h.failInbox = true;
    vi.mocked(sendPushToUser).mockRejectedValueOnce(new Error("fcm down"));
    await expect(notifyTransition({ recipientUid: "trainer-1", event: "new_request", bookingId: "bk-1" }))
      .resolves.toBeUndefined();
  });

  it("honours a type override and email:false (reminders)", async () => {
    await notifyTransition({
      recipientUid: "trainer-1",
      event: "reminder_2h",
      bookingId: "bk-2",
      type: "booking_reminder",
      email: false,
    });
    expect(h.inbox[0].doc).toMatchObject({ type: "booking_reminder", data: { bookingId: "bk-2" } });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("bookingLink", () => {
  it("sends the trainer to the provider booking detail and everyone else to the client one", async () => {
    const { bookingLink } = await import("./notify");
    expect(bookingLink("trainer-1", "bk 1", "trainer-1")).toBe("/provider/bookings/detail?id=bk%201");
    expect(bookingLink("client-1", "bk-1", "trainer-1")).toBe("/bookings/detail?id=bk-1");
    expect(bookingLink("client-1", "bk-1")).toBe("/bookings/detail?id=bk-1");
  });
});
