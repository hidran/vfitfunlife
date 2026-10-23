import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The WARMUP_KEY gate shared by the keepWarm scheduler and its four target callables.
 *
 * A) `warmupKeyMatches` — constant-time comparison, fail closed on an empty configured key.
 * B) the four callables short-circuit on an authorized ping WITHOUT auth, and fall through
 *    to their normal unauthenticated rejection on a wrong/missing key.
 *
 * The params module is mocked so each test can choose the configured key; `defineSecret`
 * is mocked too because the callables declare secrets at import time.
 */

const paramState = vi.hoisted(() => ({ warmupKey: "" }));

vi.mock("firebase-functions/params", () => ({
  defineString: vi.fn(() => ({ value: () => paramState.warmupKey })),
  defineSecret: vi.fn(() => ({ value: () => "fake-secret" })),
}));

import { isAuthorizedWarmupPing, warmupKeyMatches } from "./warmupKey";

const CONFIGURED_KEY = "0123456789abcdef0123456789abcdef";

type Callable = { run: (r: unknown) => Promise<unknown> };
type Case = [name: string, fn: unknown, expected: unknown];

/**
 * Imported lazily: the handler modules open `admin.firestore()` at module load, and the
 * test bootstrap's initializeApp() runs in its beforeAll — after static imports.
 */
async function handlers(): Promise<Case[]> {
  const [{ createBooking }, { getProviderSlots }, { chatWithAssistant }, { applyAsProvider }] =
    await Promise.all([
      import("../bookings"),
      import("../availability/callables"),
      import("../ai/chat"),
      import("../providers/applyAsProvider"),
    ]);
  return [
    ["createBooking", createBooking, { bookingId: "", finalPrice: 0, depositAmount: 0, pointsUsed: 0, pointsEarned: 0 }],
    ["getProviderSlots", getProviderSlots, { slots: [] }],
    ["chatWithAssistant", chatWithAssistant, { chatId: "", messageId: "", text: "", cards: [] }],
    ["applyAsProvider", applyAsProvider, { success: true, providerId: "", draftServicesSeeded: 0 }],
  ];
}

function ping(key: unknown) {
  return {
    auth: undefined,
    data: { __warmup: true, __warmup_key: key },
    rawRequest: { headers: {} },
  };
}

describe("warmupKeyMatches", () => {
  it("matches only the exact key", () => {
    expect(warmupKeyMatches(CONFIGURED_KEY, CONFIGURED_KEY)).toBe(true);
    expect(warmupKeyMatches(CONFIGURED_KEY, CONFIGURED_KEY.slice(0, -1) + "0")).toBe(false);
    expect(warmupKeyMatches(CONFIGURED_KEY, CONFIGURED_KEY + "x")).toBe(false);
  });

  it("fails closed when the configured key is empty", () => {
    expect(warmupKeyMatches("", CONFIGURED_KEY)).toBe(false);
    expect(warmupKeyMatches("", "")).toBe(false);
  });

  it("rejects non-string or empty provided keys", () => {
    for (const provided of [undefined, null, 123, {}, ""]) {
      expect(warmupKeyMatches(CONFIGURED_KEY, provided)).toBe(false);
    }
  });
});

describe("isAuthorizedWarmupPing", () => {
  beforeEach(() => {
    paramState.warmupKey = CONFIGURED_KEY;
  });

  it("accepts only __warmup: true with the correct key", () => {
    expect(isAuthorizedWarmupPing({ __warmup: true, __warmup_key: CONFIGURED_KEY })).toBe(true);
    expect(isAuthorizedWarmupPing({ __warmup: "true", __warmup_key: CONFIGURED_KEY })).toBe(false);
    expect(isAuthorizedWarmupPing({ __warmup_key: CONFIGURED_KEY })).toBe(false);
    expect(isAuthorizedWarmupPing({ __warmup: true })).toBe(false);
    expect(isAuthorizedWarmupPing({ __warmup: true, __warmup_key: "wrong" })).toBe(false);
    expect(isAuthorizedWarmupPing(undefined)).toBe(false);
  });

  it("rejects everything when WARMUP_KEY is unconfigured", () => {
    paramState.warmupKey = "";
    expect(isAuthorizedWarmupPing({ __warmup: true, __warmup_key: CONFIGURED_KEY })).toBe(false);
  });
});

describe("warm targets short-circuit before auth", () => {
  beforeEach(() => {
    paramState.warmupKey = CONFIGURED_KEY;
  });

  it("returns the empty response on an authorized ping", async () => {
    for (const [name, fn, expected] of await handlers()) {
      await expect((fn as Callable).run(ping(CONFIGURED_KEY)), name).resolves.toEqual(expected);
    }
  });

  it("falls through to unauthenticated on a wrong key", async () => {
    for (const [name, fn] of await handlers()) {
      await expect((fn as Callable).run(ping("wrong-key")), name)
        .rejects.toMatchObject({ code: "unauthenticated" });
    }
  });

  it("falls through when WARMUP_KEY is unconfigured", async () => {
    paramState.warmupKey = "";
    for (const [name, fn] of await handlers()) {
      await expect((fn as Callable).run(ping(CONFIGURED_KEY)), name)
        .rejects.toMatchObject({ code: "unauthenticated" });
    }
  });
});
