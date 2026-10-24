import { describe, it, expect } from "vitest";
import { addressLine, venueAddressPatch, venueAddressText } from "./venueAddress";
// The migration's module (scripts/lib/venueAddress.mjs) is the JavaScript twin of this one.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - plain ESM outside the functions package, no types
import * as script from "../../../scripts/lib/venueAddress.mjs";

const LEGACY = {
  street: "Via Po 2", city: "Torino", zipCode: "10100", country: "IT", latitude: 45.07, longitude: 7.68, neighborhood: "Centro",
};

describe("venueAddressText", () => {
  it("passes a string address through, trimmed", () => {
    expect(venueAddressText("Via Po 2")).toBe("Via Po 2");
    expect(venueAddressText("  Via Po 2 ")).toBe("Via Po 2");
  });

  it("joins a legacy object address into one line instead of returning the object", () => {
    expect(venueAddressText(LEGACY)).toBe("Via Po 2, 10100 Torino");
    expect(venueAddressText({ street: "Via Po 2" })).toBe("Via Po 2");
    expect(venueAddressText({ city: "Torino" })).toBe("Torino");
  });

  it("is null for anything that is not an address", () => {
    expect(venueAddressText(undefined)).toBeNull();
    expect(venueAddressText(null)).toBeNull();
    expect(venueAddressText("")).toBeNull();
    expect(venueAddressText("   ")).toBeNull();
    expect(venueAddressText({})).toBeNull();
    expect(venueAddressText({ street: " " })).toBeNull();
    expect(venueAddressText(42)).toBeNull();
    expect(venueAddressText(["Via Po 2"])).toBeNull();
  });
});

describe("addressLine / venueAddressPatch (ported from scripts/lib/venueAddress.mjs)", () => {
  it("is street, then zip and city, skipping missing parts", () => {
    expect(addressLine({ street: "Via Po 2", city: "Torino", zipCode: "10100" })).toBe("Via Po 2, 10100 Torino");
    expect(addressLine({ street: "Via Po 2" })).toBe("Via Po 2");
    expect(addressLine({ street: " ", city: "Torino", zipCode: "10100" })).toBe("10100 Torino");
    expect(addressLine({})).toBe("");
  });

  it("fills absent top-level fields and legacy coordinates, never overwriting", () => {
    expect(venueAddressPatch({ name: "Gym", address: LEGACY })).toEqual({
      patch: { address: "Via Po 2, 10100 Torino", city: "Torino", zipCode: "10100", country: "IT", neighborhood: "Centro", lat: 45.07, lng: 7.68 },
      filled: ["city", "zipCode", "country", "neighborhood", "lat/lng"],
    });
    expect(venueAddressPatch({ city: "Milano", lat: 1, lng: 2, address: LEGACY })?.patch).toEqual({
      address: "Via Po 2, 10100 Torino", zipCode: "10100", country: "IT", neighborhood: "Centro",
    });
  });

  it("is null when nothing needs repairing", () => {
    expect(venueAddressPatch({ address: "Via Po 2" })).toBeNull();
    expect(venueAddressPatch({})).toBeNull();
    expect(venueAddressPatch(undefined)).toBeNull();
    expect(venueAddressPatch({ address: ["x"] })).toBeNull();
  });
});

describe("the TypeScript port and the migration script agree on every fixture", () => {
  const ADDRESSES: unknown[] = [
    "Via Po 2", "  Via Po 2 ", "", "   ", undefined, null, 42, ["Via Po 2"], {},
    LEGACY,
    { street: "Via Po 2" },
    { street: " ", city: "Torino", zipCode: "10100" },
    { city: "Torino" },
    { zipCode: "10100" },
    { street: "Via Po 2", city: "Torino", zipCode: 10100 },
    { street: "Via Po 2", latitude: 45.07 },
    { street: "Via Po 2", latitude: "45.07", longitude: "7.68" },
  ];
  const DOCS: (Record<string, unknown> | undefined)[] = [
    undefined, {}, { address: "Via Po 2" },
    ...ADDRESSES.map((address) => ({ name: "Gym", address })),
    { city: "Milano", country: "IT", address: LEGACY },
    { city: "  ", zipCode: 10100, address: LEGACY },
    { lat: 1, lng: 2, address: LEGACY },
    { lat: 1, address: LEGACY },
    { lat: "1", lng: "2", address: LEGACY },
  ];

  it("venueAddressText", () => {
    expect(typeof script.venueAddressText).toBe("function");
    for (const address of ADDRESSES) {
      expect(script.venueAddressText(address), JSON.stringify(address)).toBe(venueAddressText(address));
    }
  });

  it("addressLine", () => {
    for (const address of ADDRESSES) {
      if (address === null || typeof address !== "object" || Array.isArray(address)) continue;
      const obj = address as Record<string, unknown>;
      expect(script.addressLine(obj), JSON.stringify(obj)).toBe(addressLine(obj));
    }
  });

  it("venueAddressPatch", () => {
    for (const doc of DOCS) {
      expect(script.venueAddressPatch(doc), JSON.stringify(doc)).toEqual(venueAddressPatch(doc));
    }
  });
});
