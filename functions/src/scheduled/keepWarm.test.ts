import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// onSchedule → identity so `keepWarm` is the handler itself.
vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: (_opts: unknown, handler: unknown) => handler,
}));

const paramState = vi.hoisted(() => ({ warmupKey: "test-warmup-key" }));
vi.mock("firebase-functions/params", () => ({
  defineString: vi.fn(() => ({ value: () => paramState.warmupKey })),
}));

import {
  KEEP_WARM_PING_TIMEOUT_MS,
  WARM_TARGETS,
  keepWarm,
  keepWarmUrl,
} from "./keepWarm";

const run = keepWarm as unknown as () => Promise<void>;
const fetchMock = vi.fn();

function pingedNames(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]).split("/").pop() as string);
}

describe("keepWarm", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    process.env.GCLOUD_PROJECT = "vfit-funlife";
    paramState.warmupKey = "test-warmup-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GCLOUD_PROJECT;
  });

  it("builds the callable URL from the region and project", () => {
    expect(keepWarmUrl("vfit-funlife", "getProviderSlots"))
      .toBe("https://europe-west1-vfit-funlife.cloudfunctions.net/getProviderSlots");
  });

  it("pings every warm target with the keyed warmup envelope", async () => {
    await run();

    expect(pingedNames().sort()).toEqual([...WARM_TARGETS].sort());
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/europe-west1-vfit-funlife\.cloudfunctions\.net\//);
      const request = init as { method: string; headers: Record<string, string>; body: string; signal: unknown };
      expect(request.method).toBe("POST");
      expect(request.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(request.body)).toEqual({
        data: { __warmup: true, __warmup_key: "test-warmup-key" },
      });
      expect(request.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("skips pings when WARMUP_KEY is not configured", async () => {
    paramState.warmupKey = "";
    await run();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps going when a target fails or times out", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValue({ ok: true, status: 200 });

    await expect(run()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(WARM_TARGETS.length);
    expect(KEEP_WARM_PING_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
