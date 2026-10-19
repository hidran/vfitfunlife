import { describe, it, expect } from 'vitest';
import { hostsCourses, type VenueType } from './venue';

describe('hostsCourses', () => {
  it.each<VenueType>(['gym', 'school', 'studio'])('is true for %s', (type) => {
    expect(hostsCourses(type)).toBe(true);
  });

  it.each<VenueType>(['wellness_center', 'spa', 'beauty_salon'])('is false for %s', (type) => {
    expect(hostsCourses(type)).toBe(false);
  });
});
