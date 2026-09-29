/**
 * onChatMessageCreated against the Firestore emulator: unread counter, preview, throttled
 * in-app + push notification, idempotent redelivery.
 *
 * Requires the emulator: `firebase emulators:exec --only firestore "npx vitest run test/chat-trigger.test.ts"`
 * (from functions/). Push delivery is mocked.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as admin from "firebase-admin";

const pushes = vi.hoisted(() => [] as Array<{ uid: string; title: string; data?: Record<string, string> }>);

vi.mock("../src/notifications", () => ({
  sendPushToUser: vi.fn(async (uid: string, n: { title: string; data?: Record<string, string> }) => {
    pushes.push({ uid, title: n.title, data: n.data });
  }),
}));

type Trigger = { run: (event: unknown) => Promise<unknown> };
let trigger: Trigger;
let db: admin.firestore.Firestore;

const PROJECT = "demo-vfit-chat-trigger";
let n = 0;

beforeAll(async () => {
  process.env.GCLOUD_PROJECT = PROJECT;
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
  db = admin.firestore();
  // Imported after initializeApp: the module calls admin.firestore() at load.
  const mod = await import("../src/chat/onMessageCreated");
  trigger = mod.onChatMessageCreated as unknown as Trigger;
});

beforeEach(() => {
  pushes.length = 0;
});

async function setup(opts: { recipientSettings?: Record<string, unknown> } = {}) {
  n += 1;
  const alice = `alice${n}`;
  const bob = `bob${n}`;
  const convId = `${alice}_${bob}`;
  await db.doc(`users/${bob}`).set({ role: "provider", preferredLanguage: "en", ...opts.recipientSettings });
  await db.doc(`users/${alice}`).set({ role: "customer", preferredLanguage: "it" });
  const t0 = admin.firestore.Timestamp.fromMillis(Date.now() - 1000);
  await db.doc(`conversations/${convId}`).set({
    participantIds: [alice, bob],
    participants: { [alice]: { name: "Alice", photoUrl: "https://p/a.png" }, [bob]: { name: "Bob", photoUrl: null } },
    createdAt: t0,
    lastMessageAt: t0,
  });
  return { alice, bob, convId, t0 };
}

async function post(convId: string, senderId: string, text: string, createdAt = admin.firestore.Timestamp.now()) {
  const ref = db.collection(`conversations/${convId}/messages`).doc();
  await ref.set({ senderId, text, createdAt });
  const snap = await ref.get();
  const event = { data: snap, params: { conversationId: convId, messageId: ref.id } };
  await trigger.run(event);
  return { ref, event };
}

describe("onChatMessageCreated", () => {
  it("updates preview + unread and notifies the recipient (in-app + push), localized", async () => {
    const { alice, bob, convId } = await setup();
    const { ref } = await post(convId, alice, "Ciao Bob!");

    const conv = (await db.doc(`conversations/${convId}`).get()).data()!;
    expect(conv.lastMessage).toBe("Ciao Bob!");
    expect(conv.lastSenderId).toBe(alice);
    expect(conv.unread).toEqual({ [bob]: 1 });
    expect(conv.lastPushAt[bob]).toBeInstanceOf(admin.firestore.Timestamp);
    expect((await ref.get()).data()!.processedAt).toBeTruthy();

    const inbox = await db.collection(`users/${bob}/notifications`).get();
    expect(inbox.size).toBe(1);
    expect(inbox.docs[0].data()).toMatchObject({
      title: "New message from Alice",
      body: "Ciao Bob!",
      type: "chat_message",
      data: { conversationId: convId, senderId: alice },
      imageUrl: "https://p/a.png",
      isRead: false,
    });
    expect(pushes).toEqual([{ uid: bob, title: "New message from Alice", data: { conversationId: convId, type: "chat_message" } }]);
  });

  it("throttles: a burst gives one notification but counts every message", async () => {
    const { alice, bob, convId } = await setup();
    await post(convId, alice, "one");
    await post(convId, alice, "two");
    await post(convId, alice, "three");

    const conv = (await db.doc(`conversations/${convId}`).get()).data()!;
    expect(conv.unread[bob]).toBe(3);
    expect(conv.lastMessage).toBe("three");
    expect((await db.collection(`users/${bob}/notifications`).get()).size).toBe(1);
    expect(pushes).toHaveLength(1);

    // The reply goes the other way and is not throttled by Bob's window.
    await post(convId, bob, "hi Alice");
    expect(pushes.map((p) => p.uid)).toEqual([bob, alice]);
    expect(pushes[1].title).toBe("Nuovo messaggio da Bob");
  });

  it("is idempotent on redelivery", async () => {
    const { alice, bob, convId } = await setup();
    const { event } = await post(convId, alice, "once");
    await trigger.run(event);
    const conv = (await db.doc(`conversations/${convId}`).get()).data()!;
    expect(conv.unread[bob]).toBe(1);
    expect((await db.collection(`users/${bob}/notifications`).get()).size).toBe(1);
    expect(pushes).toHaveLength(1);
  });

  it("respects the recipient's chat push switch but still writes in-app", async () => {
    const { alice, bob, convId } = await setup({
      recipientSettings: { notificationSettings: { push: { booking: true, promotion: false, system: true, chat: false } } },
    });
    await post(convId, alice, "quiet");
    expect(pushes).toHaveLength(0);
    expect((await db.collection(`users/${bob}/notifications`).get()).size).toBe(1);
  });

  it("keeps the newer preview when an older message is processed late", async () => {
    const { alice, convId } = await setup();
    await post(convId, alice, "newer");
    await post(convId, alice, "older", admin.firestore.Timestamp.fromMillis(Date.now() - 60_000));
    const conv = (await db.doc(`conversations/${convId}`).get()).data()!;
    expect(conv.lastMessage).toBe("newer");
  });

  it("does not resurrect a deleted conversation", async () => {
    const { alice, convId } = await setup();
    const ref = db.collection(`conversations/${convId}/messages`).doc();
    await ref.set({ senderId: alice, text: "late", createdAt: admin.firestore.Timestamp.now() });
    const snap = await ref.get();
    await db.doc(`conversations/${convId}`).delete();
    await trigger.run({ data: snap, params: { conversationId: convId, messageId: ref.id } });
    expect((await db.doc(`conversations/${convId}`).get()).exists).toBe(false);
    expect(pushes).toHaveLength(0);
  });
});
