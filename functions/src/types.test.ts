import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";
import { BUSINESS_VENUE_TYPES, COURSE_VENUE_TYPES, hostsCourses, type VenueType } from "./types";

// Record<VenueType, ...> makes a newly added venue type fail to compile until it is classified.
const HOSTS_COURSES: Record<VenueType, boolean> = {
  gym: true,
  school: true,
  studio: true,
  wellness_center: false,
  spa: false,
  beauty_salon: false,
  outdoor_space: false,
  event_space: false,
};

describe("hostsCourses", () => {
  it.each(Object.entries(HOSTS_COURSES) as [VenueType, boolean][])("%s -> %s", (type, expected) => {
    expect(hostsCourses(type)).toBe(expected);
  });
});

describe("COURSE_VENUE_TYPES", () => {
  it("is exactly the set hostsCourses accepts", () => {
    const accepted = (Object.keys(HOSTS_COURSES) as VenueType[]).filter(hostsCourses);
    expect([...COURSE_VENUE_TYPES].sort()).toEqual(accepted.sort());
  });

  it("matches the types the activePartnerGym rule in firestore.rules accepts", () => {
    const rules = readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8");
    const body = rules.slice(rules.indexOf("function activePartnerGym"));
    const list = /get\('type', ''\) in \[([^\]]*)\]/.exec(body);
    expect(list).not.toBeNull();
    const inRules = list![1].split(",").map((t) => t.trim().replace(/^'|'$/g, ""));
    expect(inRules.sort()).toEqual([...COURSE_VENUE_TYPES].sort());
  });

  it("is every venue type a business can choose, plus none", () => {
    expect([...BUSINESS_VENUE_TYPES]).toEqual([
      "gym", "wellness_center", "spa", "beauty_salon", "school", "studio", "outdoor_space", "event_space", "none",
    ]);
  });
});
