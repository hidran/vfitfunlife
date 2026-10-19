import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { filterActivityCourses, CourseSearchResults } from './CourseSearchResults';
import type { Course } from '@/types/course';
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));
const course = { id: 'karate', name: 'Demo Karate annuale Torino', description: 'Beginners', instructor: 'Anna', providerName: 'Anna',
  city: 'Torino', location: 'Dojo', categoryId: 'martial-arts', categoryIds: ['martial-arts', 'combat'],
  state: 'published', providerEligible: true, nextAvailableSeats: 3, capacity: 5, enrollmentClosed: false,
  lessonPriceCents: 2500, seriesPriceCents: 60000 } as Course;
describe('general activity course results', () => {
  it('finds a published course by exact title, insensitive to case and accents', () => {
    expect(filterActivityCourses([course], { query: 'DEMO KARATÉ ANNUALE TORINO' })).toEqual([course]);
    expect(filterActivityCourses([course], { query: 'yoga' })).toEqual([]);
  });
  it('matches parent/leaf categories and filters prices and unavailable courses', () => {
    expect(filterActivityCourses([course], { category: 'combat', maxPrice: 25 })).toEqual([course]);
    expect(filterActivityCourses([course], { category: 'yoga' })).toEqual([]);
    expect(filterActivityCourses([course], { minPrice: 26 })).toEqual([]);
    for (const change of [{ state: 'archived' }, { providerEligible: false }, { enrollmentClosed: true }]) {
      expect(filterActivityCourses([{ ...course, ...change } as Course], {})).toEqual([]);
    }
  });
  it('keeps a course discoverable when its next lesson is full because later lessons may be bookable', () => {
    expect(filterActivityCourses([{ ...course, nextAvailableSeats: 0 }], { query: course.name })).toHaveLength(1);
  });
  it('opens the selected course booking page rather than an individual service booking', () => {
    render(<CourseSearchResults courses={[course]} />);
    expect(screen.getByRole('heading', { name: course.name })).toBeVisible();
    expect(screen.getByRole('link', { name: 'courses.sessions' })).toHaveAttribute('href', '/courses?id=karate');
    expect(screen.getByText(/€25.00/)).toBeVisible();
  });
});
