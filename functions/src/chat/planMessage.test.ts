import { describe, it, expect } from "vitest";
import { CHAT_NOTIFY_THROTTLE_MS, planChatMessage } from "./planMessage";
import { buildChatNotification, previewText } from "./chatMessages";

const NOW = 1_800_000_000_000;
const conv = { participantIds: ["alice", "bob"], lastMessageAtMillis: NOW - 1000, lastSenderId: "bob" };

describe("planChatMessage", () => {
  it("targets the other participant, updates the preview and notifies the first time", () => {
    const plan = planChatMessage(conv, { senderId: "alice", text: "  Ciao\n Bob ", createdAtMillis: NOW }, NOW);
    expect(plan).toEqual({ kind: "apply", recipientId: "bob", updatePreview: true, preview: "Ciao Bob", notify: true });
  });

  it("throttles a second notification inside the window, per recipient", () => {
    const recent = { ...conv, lastPushAtMillis: { bob: NOW - CHAT_NOTIFY_THROTTLE_MS + 1 } };
    const plan = planChatMessage(recent, { senderId: "alice", text: "again", createdAtMillis: NOW }, NOW);
    expect(plan).toMatchObject({ kind: "apply", recipientId: "bob", notify: false });

    // Alice has not been notified recently: Bob's reply does notify her.
    const reply = planChatMessage(recent, { senderId: "bob", text: "hi", createdAtMillis: NOW }, NOW);
    expect(reply).toMatchObject({ recipientId: "alice", notify: true });
  });

  it("notifies again once the window has passed", () => {
    const old = { ...conv, lastPushAtMillis: { bob: NOW - CHAT_NOTIFY_THROTTLE_MS } };
    expect(planChatMessage(old, { senderId: "alice", text: "x", createdAtMillis: NOW }, NOW)).toMatchObject({ notify: true });
  });

  it("does not let a late, older message overwrite a newer preview", () => {
    const plan = planChatMessage(conv, { senderId: "alice", text: "old", createdAtMillis: NOW - 5000 }, NOW);
    expect(plan).toMatchObject({ kind: "apply", updatePreview: false });
  });

  it("updates the preview for the first message (lastMessageAt == createdAt, no lastSenderId)", () => {
    const fresh = { participantIds: ["alice", "bob"], lastMessageAtMillis: NOW, lastSenderId: null };
    expect(planChatMessage(fresh, { senderId: "bob", text: "first", createdAtMillis: NOW }, NOW))
      .toMatchObject({ updatePreview: true, recipientId: "alice" });
  });

  it("caps the stored preview", () => {
    const plan = planChatMessage(conv, { senderId: "alice", text: "y".repeat(500), createdAtMillis: NOW }, NOW);
    expect(plan.kind === "apply" && plan.preview.length).toBe(140);
  });

  it("skips malformed input", () => {
    expect(planChatMessage({ participantIds: ["a"] }, { senderId: "a", text: "x" }, NOW).kind).toBe("skip");
    expect(planChatMessage(conv, { senderId: "mallory", text: "x" }, NOW).kind).toBe("skip");
    expect(planChatMessage(conv, { senderId: "alice", text: "   " }, NOW).kind).toBe("skip");
    expect(planChatMessage(conv, { senderId: "alice", text: 42 }, NOW).kind).toBe("skip");
  });
});

describe("buildChatNotification", () => {
  it("is localized, with the sender's name", () => {
    expect(buildChatNotification("it", "Anna", "Ciao")).toEqual({ title: "Nuovo messaggio da Anna", body: "Ciao" });
    expect(buildChatNotification("de", "Anna", "Hallo").title).toBe("Neue Nachricht von Anna");
  });

  it("falls back to Italian and to an anonymous title", () => {
    expect(buildChatNotification("xx", "", "Ciao").title).toBe("Nuovo messaggio");
    expect(buildChatNotification(undefined, null, "Hi").title).toBe("Nuovo messaggio");
  });

  it("caps the body", () => {
    expect(buildChatNotification("en", "A", "z".repeat(300)).body.length).toBe(120);
  });
});

describe("previewText", () => {
  it("collapses whitespace", () => {
    expect(previewText("a \n\t b", 10)).toBe("a b");
  });
});
