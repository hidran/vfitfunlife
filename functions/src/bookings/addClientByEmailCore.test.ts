import { describe, it, expect } from "vitest";
import {
  ADD_CLIENT_MAX_CALLS,
  RATE_LIMIT_WINDOW_MS,
  addClientRateLimitDocId,
  addedClientFrom,
  appBaseUrl,
  decideRateLimit,
  normalizeClientEmail,
  registerUrl,
  validateAddClientRequest,
} from "./addClientByEmailCore";

describe("normalizeClientEmail", () => {
  it("trims and lowercases a valid address", () => {
    expect(normalizeClientEmail("  Mario.Rossi@Example.COM ")).toBe("mario.rossi@example.com");
  });

  it("rejects non-strings, empty, malformed and over-long input", () => {
    for (const bad of [undefined, null, 42, {}, "", "   ", "mario", "mario@", "@x.it", "a b@x.it", "a@x", "a/b@x.it"]) {
      expect(normalizeClientEmail(bad)).toBeNull();
    }
    expect(normalizeClientEmail(`${"a".repeat(250)}@x.it`)).toBeNull();
  });
});

describe("validateAddClientRequest", () => {
  it("returns the normalized email", () => {
    expect(validateAddClientRequest({ email: " A@B.it " })).toEqual({ email: "a@b.it" });
  });

  it("throws invalid-argument invalid_email for a bad payload", () => {
    for (const bad of [null, [], "a@b.it", { email: "nope" }, {}]) {
      expect(() => validateAddClientRequest(bad)).toThrow("invalid_email");
    }
  });
});

describe("decideRateLimit", () => {
  const NOW = 1_800_000_000_000;

  it("allows the first call and records it", () => {
    expect(decideRateLimit(undefined, NOW)).toEqual({ allowed: true, calls: [NOW], retryAfterMs: 0 });
  });

  it("allows up to the max within the window, then refuses", () => {
    const calls = Array.from({ length: ADD_CLIENT_MAX_CALLS - 1 }, (_, i) => NOW - (i + 1) * 60_000);
    const nth = decideRateLimit(calls, NOW);
    expect(nth.allowed).toBe(true);
    expect(nth.calls).toHaveLength(ADD_CLIENT_MAX_CALLS);

    const over = decideRateLimit(nth.calls, NOW + 1);
    expect(over.allowed).toBe(false);
    expect(over.calls).toHaveLength(ADD_CLIENT_MAX_CALLS);
  });

  it("is a rolling window: calls older than 24h no longer count", () => {
    const old = Array.from({ length: ADD_CLIENT_MAX_CALLS }, () => NOW - RATE_LIMIT_WINDOW_MS);
    const d = decideRateLimit(old, NOW);
    expect(d.allowed).toBe(true);
    expect(d.calls).toEqual([NOW]); // pruned
  });

  it("reports when the oldest counted call leaves the window", () => {
    const oldest = NOW - RATE_LIMIT_WINDOW_MS + 5_000;
    const calls = [oldest, ...Array.from({ length: ADD_CLIENT_MAX_CALLS - 1 }, () => NOW - 1_000)];
    const d = decideRateLimit(calls, NOW);
    expect(d.allowed).toBe(false);
    expect(d.retryAfterMs).toBe(5_000);
  });

  it("ignores stored garbage and future timestamps", () => {
    expect(decideRateLimit("x", NOW).calls).toEqual([NOW]);
    expect(decideRateLimit([null, "1", NaN, NOW + 10_000], NOW).calls).toEqual([NOW]);
  });
});

describe("urls and ids", () => {
  it("uses APP_URL when set, stripping trailing slashes", () => {
    expect(appBaseUrl({ APP_URL: "https://app.vfit.it/" } as NodeJS.ProcessEnv)).toBe("https://app.vfit.it");
  });

  it("falls back to the project's Hosting site", () => {
    expect(registerUrl({ GCLOUD_PROJECT: "vfit-app-staging" } as NodeJS.ProcessEnv))
      .toBe("https://vfit-app-staging.web.app/auth/register");
  });

  it("keys the counter doc by trainer", () => {
    expect(addClientRateLimitDocId("t1")).toBe("addClient_t1");
  });

  it("returns only the dropdown's fields", () => {
    expect(addedClientFrom("t1_u1", { userId: "u1", name: "Anna", email: "a@b.it", totalSpent: 9, lastVisit: null }))
      .toEqual({ id: "t1_u1", userId: "u1", name: "Anna", email: "a@b.it" });
  });
});
