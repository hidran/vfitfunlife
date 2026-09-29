import { describe, it, expect } from "vitest";
import { withoutToken } from "./tokens";

describe("withoutToken", () => {
  it("drops the matching token and keeps the others", () => {
    const stored = [
      { token: "a", platform: "web" },
      { token: "b", platform: "ios" },
    ];
    expect(withoutToken(stored, "a")).toEqual({
      tokens: [{ token: "b", platform: "ios" }],
      removed: true,
    });
  });

  it("is a no-op for an unknown token", () => {
    const stored = [{ token: "a", platform: "web" }];
    expect(withoutToken(stored, "zzz")).toEqual({ tokens: stored, removed: false });
  });

  it("tolerates a missing or malformed list", () => {
    expect(withoutToken(undefined, "a")).toEqual({ tokens: [], removed: false });
    expect(withoutToken("nope", "a")).toEqual({ tokens: [], removed: false });
  });
});
