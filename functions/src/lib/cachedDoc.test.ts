import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGet, mockDoc } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockDoc = vi.fn(() => ({ get: mockGet }));
  return { mockGet, mockDoc };
});

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({ doc: mockDoc }),
}));

import { cachedDocRead, invalidateCachedDoc, clearCachedDocCacheForTests } from "./cachedDoc";

function snap(data: Record<string, unknown> | undefined) {
  return data === undefined ? { exists: false } : { exists: true, data: () => data };
}

describe("cachedDocRead", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDoc.mockClear();
    clearCachedDocCacheForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads through to Firestore on a cache miss", async () => {
    mockGet.mockResolvedValue(snap({ enabled: true }));

    const result = await cachedDocRead("systemSettings/aiAssistant");

    expect(mockDoc).toHaveBeenCalledWith("systemSettings/aiAssistant");
    expect(result).toEqual({ enabled: true });
  });

  it("resolves to undefined for a document that does not exist, and caches that", async () => {
    mockGet.mockResolvedValue(snap(undefined));

    const first = await cachedDocRead("systemSettings/missing");
    const second = await cachedDocRead("systemSettings/missing");

    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("serves a second call within the TTL from cache, without hitting Firestore again", async () => {
    mockGet.mockResolvedValue(snap({ autoApprove: true }));

    await cachedDocRead("systemSettings/providerOnboarding", 60_000);
    await cachedDocRead("systemSettings/providerOnboarding", 60_000);

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("re-reads once the TTL has elapsed", async () => {
    mockGet
      .mockResolvedValueOnce(snap({ autoApprove: true }))
      .mockResolvedValueOnce(snap({ autoApprove: false }));

    const first = await cachedDocRead("systemSettings/providerOnboarding", 1_000);
    vi.advanceTimersByTime(1_001);
    const second = await cachedDocRead("systemSettings/providerOnboarding", 1_000);

    expect(first).toEqual({ autoApprove: true });
    expect(second).toEqual({ autoApprove: false });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent reads for the same path into a single Firestore call", async () => {
    let resolveGet!: (v: unknown) => void;
    mockGet.mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve;
      }),
    );

    const a = cachedDocRead("systemSettings/aiAssistant");
    const b = cachedDocRead("systemSettings/aiAssistant");
    resolveGet(snap({ enabled: false }));

    const [resultA, resultB] = await Promise.all([a, b]);

    expect(resultA).toEqual({ enabled: false });
    expect(resultB).toEqual({ enabled: false });
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("keeps caches for different document paths independent", async () => {
    mockGet
      .mockResolvedValueOnce(snap({ enabled: true }))
      .mockResolvedValueOnce(snap({ autoApprove: false }));

    const ai = await cachedDocRead("systemSettings/aiAssistant");
    const onboarding = await cachedDocRead("systemSettings/providerOnboarding");

    expect(ai).toEqual({ enabled: true });
    expect(onboarding).toEqual({ autoApprove: false });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed read, so the next call retries against Firestore", async () => {
    mockGet
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce(snap({ enabled: true }));

    await expect(cachedDocRead("systemSettings/aiAssistant")).rejects.toThrow("unavailable");
    const result = await cachedDocRead("systemSettings/aiAssistant");

    expect(result).toEqual({ enabled: true });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("invalidateCachedDoc forces the next read to hit Firestore again", async () => {
    mockGet
      .mockResolvedValueOnce(snap({ enabled: false }))
      .mockResolvedValueOnce(snap({ enabled: true }));

    await cachedDocRead("systemSettings/aiAssistant");
    invalidateCachedDoc("systemSettings/aiAssistant");
    const result = await cachedDocRead("systemSettings/aiAssistant");

    expect(result).toEqual({ enabled: true });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("invalidateCachedDoc is a no-op for a path that was never cached", () => {
    expect(() => invalidateCachedDoc("systemSettings/neverRead")).not.toThrow();
  });
});
