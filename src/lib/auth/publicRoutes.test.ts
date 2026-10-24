import { describe, expect, it } from 'vitest';
import { PUBLIC_MAIN_ROUTES, isPublicMainRoute } from './publicRoutes';

describe('isPublicMainRoute', () => {
  it.each(['/fit/gyms', '/fit/gyms/timetable', '/venue', '/courses', '/courses/detail'])('opens %s to a visitor', (path) => {
    expect(isPublicMainRoute(path)).toBe(true);
  });

  it('accepts the trailing slash of the static export', () => {
    expect(isPublicMainRoute('/fit/gyms/')).toBe(true);
    expect(isPublicMainRoute('/courses/detail/')).toBe(true);
  });

  it.each(['/home', '/bookings', '/profile', '/booking', '/courses/edit', '/fit', '/fit/gyms/x', '/provider/dashboard', '/', '', null, undefined])(
    'keeps %s behind sign-in',
    (path) => {
      expect(isPublicMainRoute(path)).toBe(false);
    },
  );

  it('lists exactly the discovery pages', () => {
    expect([...PUBLIC_MAIN_ROUTES].sort()).toEqual(['/courses', '/courses/detail', '/fit/gyms', '/fit/gyms/timetable', '/venue']);
  });
});
