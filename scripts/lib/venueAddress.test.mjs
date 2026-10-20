import { describe, it, expect } from "vitest";
import { addressLine, venueAddressPatch } from "./venueAddress.mjs";

describe("addressLine", () => {
  it("is street, then zip and city", () => {
    expect(addressLine({ street: "Via Po 2", city: "Torino", zipCode: "10100" })).toBe("Via Po 2, 10100 Torino");
  });
  it("skips missing parts", () => {
    expect(addressLine({ street: "Via Po 2" })).toBe("Via Po 2");
    expect(addressLine({ street: "Via Po 2", city: "Torino" })).toBe("Via Po 2, Torino");
    expect(addressLine({ street: " ", city: "Torino", zipCode: "10100" })).toBe("10100 Torino");
    expect(addressLine({})).toBe("");
  });
});

describe("venueAddressPatch", () => {
  it("converts a full object and fills the absent top-level fields", () => {
    const out = venueAddressPatch({
      name: "Gym",
      address: { street: "Via Po 2", city: "Torino", zipCode: "10100", country: "IT" },
    });
    expect(out.patch).toEqual({ address: "Via Po 2, 10100 Torino", city: "Torino", zipCode: "10100", country: "IT" });
    expect(out.filled).toEqual(["city", "zipCode", "country"]);
  });

  it("never overwrites an existing top-level value", () => {
    const out = venueAddressPatch({
      city: "Milano",
      country: "IT",
      address: { street: "Via Po 2", city: "Torino", zipCode: "10100", country: "Italia" },
    });
    expect(out.patch).toEqual({ address: "Via Po 2, 10100 Torino", zipCode: "10100" });
  });

  it("treats a blank or non-string top-level value as absent", () => {
    const out = venueAddressPatch({ city: "  ", zipCode: 10100, address: { street: "Via Po 2", city: "Torino", zipCode: "10100" } });
    expect(out.patch.city).toBe("Torino");
    expect(out.patch.zipCode).toBe("10100");
  });

  it("handles a partial object", () => {
    const out = venueAddressPatch({ address: { street: "Via Po 2" } });
    expect(out.patch).toEqual({ address: "Via Po 2" });
    expect(out.filled).toEqual([]);
  });

  it("converts an empty object to an empty string address", () => {
    expect(venueAddressPatch({ address: {} }).patch).toEqual({ address: "" });
  });

  it("keeps the legacy nested coordinates as lat/lng when the doc has none, never over existing ones", () => {
    const address = { street: "Via Po 2", latitude: 45.07, longitude: 7.68, neighborhood: "Centro" };
    expect(venueAddressPatch({ address }).patch).toEqual({
      address: "Via Po 2",
      neighborhood: "Centro",
      lat: 45.07,
      lng: 7.68,
    });
    expect(venueAddressPatch({ lat: 1, lng: 2, address }).patch).not.toHaveProperty("lat");
  });

  it("leaves canonical and unusable addresses alone (idempotent)", () => {
    expect(venueAddressPatch({ address: "Via Po 2, Torino" })).toBeNull();
    expect(venueAddressPatch({ address: "" })).toBeNull();
    expect(venueAddressPatch({})).toBeNull();
    expect(venueAddressPatch({ address: null })).toBeNull();
    expect(venueAddressPatch({ address: ["x"] })).toBeNull();
  });

  it("a second pass over the patched document is a no-op", () => {
    const data = { address: { street: "Via Po 2", city: "Torino", zipCode: "10100", country: "IT" } };
    const { patch } = venueAddressPatch(data);
    expect(venueAddressPatch({ ...data, ...patch })).toBeNull();
  });
});
