import { describe, it, expect } from "vitest";
import { DEMO_SEED_PARTS, resolveSeedParts } from "./seedParts";

const ok = (raw: unknown) => {
  const result = resolveSeedParts(raw);
  if ("error" in result) throw new Error(`expected parts, got: ${result.error}`);
  return result.parts;
};

describe("resolveSeedParts", () => {
  it("runs everything when the body has no parts", () => {
    expect(ok(undefined)).toEqual([...DEMO_SEED_PARTS]);
    expect(ok(null)).toEqual([...DEMO_SEED_PARTS]);
  });

  it("keeps only what was asked for", () => {
    expect(ok(["content", "clients"])).toEqual(["content", "clients"]);
  });

  it("runs an empty selection as nothing, rather than as everything", () => {
    expect(ok([])).toEqual([]);
  });

  it("reorders into the canonical order, so core never runs after the parts that read it", () => {
    expect(ok(["coords", "photos", "core"])).toEqual(["core", "photos", "coords"]);
  });

  it("de-duplicates a repeated part", () => {
    expect(ok(["core", "core", "content"])).toEqual(["core", "content"]);
  });

  it("rejects an unknown part instead of quietly skipping it", () => {
    const result = resolveSeedParts(["core", "fun", "typo"]);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("fun, typo");
  });

  it("rejects a non-array parts field", () => {
    expect(resolveSeedParts("core")).toHaveProperty("error");
    expect(resolveSeedParts({ core: true })).toHaveProperty("error");
  });

  it("does not expose the VFun generator, which is pilot-flagged", () => {
    expect(DEMO_SEED_PARTS).not.toContain("fun");
  });
});
