import { describe, it, expect } from "vitest";
import { hostsCourses, type VenueType } from "./types";

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
