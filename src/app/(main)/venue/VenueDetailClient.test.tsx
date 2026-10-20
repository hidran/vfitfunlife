import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockVenue: Record<string, unknown>;
let mockLessons: unknown[] = [];
let mockCourses: unknown[] = [];
const seen = { lessons: [] as unknown[][], courses: [] as unknown[][] };

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('id=v1') }));
vi.mock('@/hooks/useVenues', () => ({
  useVenue: () => ({ data: mockVenue, isLoading: false, refetch: vi.fn() }),
  useVenueServices: () => ({ data: [] }),
}));
vi.mock('@/hooks/useCourses', () => ({
  useVenueNextLessons: (...args: unknown[]) => { seen.lessons.push(args); return { data: args[0] ? mockLessons : undefined, isLoading: false }; },
  usePublishedVenueCourses: (...args: unknown[]) => { seen.courses.push(args); return { data: args[0] ? mockCourses : undefined, isLoading: false }; },
}));
vi.mock('@/components/gallery/PhotoGallery', () => ({ PhotoGallery: () => null }));

import VenueDetailClient from './VenueDetailClient';

const venue = (patch: Record<string, unknown>) => ({
  id: 'v1',
  name: 'Palestra Rossi',
  slug: 'palestra-rossi',
  type: 'gym',
  city: 'Torino',
  address: 'Via Po 2',
  rating: 0,
  reviewCount: 0,
  isPartner: true,
  partnerStatus: 'active',
  isActive: true,
  description: '',
  heroGradients: [],
  amenities: [],
  hours: [],
  ...patch,
});

beforeEach(() => {
  mockVenue = venue({});
  mockLessons = []; mockCourses = []; seen.lessons = []; seen.courses = [];
});

describe('VenueDetailClient timetable button', () => {
  it.each(['gym', 'school', 'studio'])('shows the timetable for an active partner %s', (type) => {
    mockVenue = venue({ type });
    render(<VenueDetailClient />);
    expect(screen.getByRole('link', { name: 'Palinsesto palestra' })).toHaveAttribute(
      'href',
      '/fit/gyms/timetable?id=v1',
    );
  });

  it('hides it for venues that do not host courses', () => {
    mockVenue = venue({ type: 'spa' });
    render(<VenueDetailClient />);
    expect(screen.queryByRole('link', { name: 'Palinsesto palestra' })).toBeNull();
  });

  it('hides it until the partnership is active', () => {
    mockVenue = venue({ type: 'school', partnerStatus: 'pending' });
    render(<VenueDetailClient />);
    expect(screen.queryByRole('link', { name: 'Palinsesto palestra' })).toBeNull();
  });
});

describe('VenueDetailClient opening hours', () => {
  it('renders the block when the venue has hours', () => {
    mockVenue = venue({ hours: [{ day: 'Lun - Ven', time: '06:00 - 22:00' }] });
    render(<VenueDetailClient />);
    expect(screen.getByText('Orari')).toBeInTheDocument();
    expect(screen.getByText('06:00 - 22:00')).toBeInTheDocument();
  });

  it('omits the block for a venue with no hours, such as a freshly approved business', () => {
    mockVenue = venue({ hours: [] });
    render(<VenueDetailClient />);
    expect(screen.queryByText('Orari')).toBeNull();
  });

  it('does not throw when hours and amenities are absent altogether', () => {
    mockVenue = venue({ hours: undefined, amenities: undefined });
    expect(() => render(<VenueDetailClient />)).not.toThrow();
    expect(screen.queryByText('Orari')).toBeNull();
  });
});

const stamp = (iso: string) => ({ toDate: () => new Date(iso), toMillis: () => new Date(iso).getTime() });
const lesson = (id: string, courseId: string, iso: string, instructor: string) => ({ id, courseId, startsAt: stamp(iso), endsAt: stamp(iso),
  instructorName: instructor, state: 'scheduled', listed: true });

describe('VenueDetailClient next lessons', () => {
  it('lists up to three upcoming lessons with the course name and instructor, and links to the full timetable', () => {
    mockCourses = [{ id: 'c1', name: 'Yoga', timezone: 'Europe/Rome' }, { id: 'c2', name: 'Pilates', timezone: 'Europe/Rome' }];
    mockLessons = [lesson('2099-01-05', 'c1', '2099-01-05T18:00:00Z', 'Anna'), lesson('2099-01-06', 'c2', '2099-01-06T09:00:00Z', 'Bruno'),
      lesson('2099-01-07', 'c1', '2099-01-07T18:00:00Z', 'Anna')];
    render(<VenueDetailClient />);
    expect(seen.lessons.at(-1)).toEqual(['v1', 3]);
    const section = screen.getByRole('region', { name: 'Prossime lezioni' });
    expect(within(section).getAllByRole('link').filter(l => l.getAttribute('href')?.startsWith('/courses'))).toHaveLength(3);
    expect(within(section).getByText('Pilates')).toBeInTheDocument();
    expect(within(section).getByText(/Bruno/)).toBeInTheDocument();
    expect(within(section).getAllByRole('link')[0]).toHaveAttribute('href', '/courses?id=c1&lesson=2099-01-05');
    expect(within(section).getByRole('link', { name: 'Orario completo' })).toHaveAttribute('href', '/fit/gyms/timetable?id=v1');
  });

  it('shows nothing when there are no lessons and no published courses', () => {
    render(<VenueDetailClient />);
    expect(screen.queryByRole('region', { name: 'Prossime lezioni' })).toBeNull();
  });

  it('keeps the section, with the timetable link, when courses exist but no lesson is upcoming', () => {
    mockCourses = [{ id: 'c1', name: 'Yoga', timezone: 'Europe/Rome' }];
    render(<VenueDetailClient />);
    const section = screen.getByRole('region', { name: 'Prossime lezioni' });
    expect(within(section).getByRole('link', { name: 'Orario completo' })).toBeInTheDocument();
  });

  it('does not query lessons for venues that do not host courses or are not active partners', () => {
    mockVenue = venue({ type: 'spa' });
    render(<VenueDetailClient />);
    expect(seen.lessons.every(args => args[0] === undefined)).toBe(true);
    expect(seen.courses.every(args => args[0] === undefined)).toBe(true);
    expect(screen.queryByRole('region', { name: 'Prossime lezioni' })).toBeNull();
  });

  it('no longer shows the legacy classes tab', () => {
    render(<VenueDetailClient />);
    expect(screen.queryByRole('button', { name: 'Corsi' })).toBeNull();
  });
});
