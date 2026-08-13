import { describe, it, expect } from "vitest";
import {
  PILOT_FLAG_KEYS,
  PilotFlagValidationError,
  classifyRemoteConfigError,
  encodeFlagValue,
  flagParameter,
  validateFlagUpdates,
} from "./pilotFlagSpec";

describe("validateFlagUpdates", () => {
  it("accepts a partial update of whitelisted keys", () => {
    expect(validateFlagUpdates({ show_vfun: true })).toEqual(["show_vfun"]);
    expect(validateFlagUpdates({ pilot_mode: false, pilot_city: "Milano" }).sort()).toEqual([
      "pilot_city",
      "pilot_mode",
    ]);
  });

  it("rejects a key outside the whitelist — the guard that stops this becoming a raw RC editor", () => {
    expect(() =>
      validateFlagUpdates({ stripe_secret: true } as never),
    ).toThrow(PilotFlagValidationError);
  });

  it("rejects a value of the wrong type", () => {
    expect(() => validateFlagUpdates({ show_vfun: "yes" } as never)).toThrow(
      /must be a boolean/,
    );
    expect(() => validateFlagUpdates({ pilot_city: 5 } as never)).toThrow(
      /must be a string/,
    );
  });

  it("rejects an empty payload", () => {
    expect(() => validateFlagUpdates({})).toThrow(/No flags supplied/);
  });

  it("rejects a blank pilot_city, which would silently disable the city filter", () => {
    expect(() => validateFlagUpdates({ pilot_city: "   " })).toThrow(/cannot be empty/);
  });

  it("covers exactly the four pilot parameters", () => {
    expect([...PILOT_FLAG_KEYS].sort()).toEqual([
      "pilot_city",
      "pilot_mode",
      "show_vfun",
      "show_vlife",
    ]);
  });
});

describe("encodeFlagValue", () => {
  it("serialises booleans as strings, since a real boolean invalidates the template", () => {
    expect(encodeFlagValue(true)).toBe("true");
    expect(encodeFlagValue(false)).toBe("false");
    expect(typeof encodeFlagValue(true)).toBe("string");
  });

  it("trims strings", () => {
    expect(encodeFlagValue("  Torino ")).toBe("Torino");
  });
});

describe("flagParameter", () => {
  it("carries the declared valueType and a description, so a deleted key is recreated intact", () => {
    expect(flagParameter("show_vlife", true)).toEqual({
      defaultValue: { value: "true" },
      valueType: "BOOLEAN",
      description: "Show the VLife section. Independent of pilot_mode.",
    });
  });

  it("writes pilot_city as a STRING parameter", () => {
    const param = flagParameter("pilot_city", "Milano");
    expect(param.valueType).toBe("STRING");
    expect(param.defaultValue.value).toBe("Milano");
  });
});

describe("classifyRemoteConfigError", () => {
  it("recognises a missing IAM permission", () => {
    expect(classifyRemoteConfigError(new Error("PERMISSION_DENIED on resource"))).toBe(
      "permission",
    );
  });

  it("recognises an ETag conflict from a concurrent publish", () => {
    expect(classifyRemoteConfigError(new Error("ETAG mismatch"))).toBe("conflict");
    expect(classifyRemoteConfigError(new Error("HTTP 409"))).toBe("conflict");
  });

  it("falls through to unknown", () => {
    expect(classifyRemoteConfigError(new Error("socket hang up"))).toBe("unknown");
  });
});
