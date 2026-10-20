import { describe, expect, it } from "vitest";
import { RaceTimeout, retryEmulatorAbort, withTimeout } from "./raceRetry.testutil";

describe("race helpers", () => {
  it("fails a hung step fast and names it", async () => {
    const started = Date.now();
    await expect(withTimeout("join u2 on 2099-10-12", new Promise(() => undefined), 50))
      .rejects.toMatchObject({ name: "RaceTimeout", label: "join u2 on 2099-10-12",
        message: expect.stringContaining("join u2 on 2099-10-12") });
    expect(Date.now() - started).toBeLessThan(1000);
  });
  it("passes a value and a rejection through untouched", async () => {
    await expect(withTimeout("ok", Promise.resolve(7), 50)).resolves.toBe(7);
    await expect(withTimeout("no", Promise.reject(new Error("lesson_full")), 50)).rejects.toThrow("lesson_full");
  });
  it("retries emulator aborts with a fresh call each time", async () => {
    let calls = 0;
    const result = await retryEmulatorAbort(async () => {
      calls++;
      if (calls < 3) throw new Error("3 INVALID_ARGUMENT: Transaction is invalid or closed");
      return calls;
    });
    expect(result).toBe(3);
  });
  it("does not retry a domain refusal, and gives up after the attempts", async () => {
    let calls = 0;
    await expect(retryEmulatorAbort(async () => { calls++; throw new Error("lesson_full"); })).rejects.toThrow("lesson_full");
    expect(calls).toBe(1);
    calls = 0;
    await expect(retryEmulatorAbort(async () => { calls++; throw new Error("Transaction is invalid or closed"); }, 3))
      .rejects.toThrow("invalid or closed");
    expect(calls).toBe(3);
  });
  it("does not retry a hang: the stalled attempt is the finding", async () => {
    let calls = 0;
    const error = await retryEmulatorAbort(() => { calls++; return new Promise<never>(() => undefined); }, 8,
      "promote #1", 40).catch((e) => e);
    expect(error).toBeInstanceOf(RaceTimeout);
    expect(error.message).toContain("promote #1 (attempt 1)");
    expect(calls).toBe(1);
  });
});
