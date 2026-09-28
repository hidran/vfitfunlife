import { describe, it, expect } from "vitest";
import { coordsOf, geohashPatch } from "./geohashPatch";

// geofire-common's geohashForLocation([41.1171, 16.8719], 10), checked against ngeohash
// over 20k random points while building this: the client and the trigger must agree.
const BARI = { lat: 41.1171, lng: 16.8719 };
const BARI_HASH = "sr7czvjsry";

describe("coordsOf", () => {
  it("reads the flat lat/lng pair", () => {
    expect(coordsOf({ lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 });
  });
  it("falls back to legacy address.latitude/longitude", () => {
    expect(coordsOf({ address: { latitude: 45.46, longitude: 9.24 } })).toEqual({ lat: 45.46, lng: 9.24 });
  });
  it("rejects non-numeric or non-finite values", () => {
    expect(coordsOf({ lat: "41", lng: 16 })).toBeNull();
    expect(coordsOf({ lat: NaN, lng: 16 })).toBeNull();
    expect(coordsOf({ address: "Via Roma 1" })).toBeNull();
  });
});

describe("geohashPatch", () => {
  it("adds a precision-10 geohash when missing", () => {
    expect(geohashPatch({ ...BARI })).toEqual({ geohash: BARI_HASH });
  });

  it("is idempotent: nothing to write once the geohash matches", () => {
    expect(geohashPatch({ ...BARI, geohash: BARI_HASH })).toBeNull();
  });

  it("recomputes when the location moved", () => {
    const patch = geohashPatch({ lat: 40.8518, lng: 14.2681, geohash: BARI_HASH });
    expect(patch?.geohash).toMatch(/^sr60/);
    expect(patch?.geohash).toHaveLength(10);
  });

  it("normalizes legacy nested coordinates into flat lat/lng too", () => {
    expect(geohashPatch({ address: { latitude: BARI.lat, longitude: BARI.lng } })).toEqual({
      lat: BARI.lat,
      lng: BARI.lng,
      geohash: BARI_HASH,
    });
  });

  it("removes a stale geohash when coordinates are gone, and otherwise leaves the doc alone", () => {
    expect(geohashPatch({ geohash: BARI_HASH })).toEqual({ geohash: null });
    expect(geohashPatch({ name: "no coords" })).toBeNull();
  });
});
