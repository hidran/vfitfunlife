import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  venueCall: vi.fn(),
  locations: [] as unknown[],
  rooms: {} as Record<string, unknown[]>,
  links: [] as unknown[],
  managed: [] as { id: string }[],
  role: 'customer',
}));

vi.mock('@/lib/firebase/venueSpaces', () => ({
  venueCall: mocks.venueCall,
  fetchVenueLocations: async () => mocks.locations,
  fetchVenueRooms: async (_v: string, l: string) => mocks.rooms[l] ?? [],
  fetchVenueInstructorLinks: async () => mocks.links,
}));
vi.mock('@/hooks/useManagedVenues', () => ({ useManagedVenues: () => ({ venues: mocks.managed, isLoading: false }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: { user: { role: string } }) => unknown) => select({ user: { role: mocks.role } }),
}));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string, values?: Record<string, string>) => values ? `${key}:${JSON.stringify(values)}` : key, locale: 'en' }),
}));

import { VenueSpacesPanel } from './VenueSpacesPanel';

const renderPanel = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <VenueSpacesPanel venueId="v1" />
  </QueryClientProvider>,
);

const north = { id: 'l1', name: 'North', address: 'Via Roma 1', city: 'Torino', timezone: 'Europe/Rome', isActive: true };
const closed = { id: 'l2', name: 'Old site', address: 'Via Po 2', city: 'Torino', timezone: 'Europe/Rome', isActive: false };

beforeEach(() => {
  mocks.venueCall.mockReset();
  mocks.venueCall.mockResolvedValue({ id: 'x' });
  mocks.locations = [north, closed];
  mocks.rooms = { l1: [{ id: 'r1', name: 'Studio A', isActive: true }], l2: [{ id: 'r2', name: 'Hall', isActive: false }] };
  mocks.links = [{ id: 'i1', name: 'Anna Rossi', isActive: true }];
  mocks.managed = [{ id: 'v1' }];
  mocks.role = 'customer';
});

describe('VenueSpacesPanel', () => {
  it('lists active and inactive locations with their rooms and the linked instructors', async () => {
    renderPanel();
    expect(await screen.findByText(/Via Roma 1/)).toBeInTheDocument();
    expect(screen.getByText('Old site')).toBeInTheDocument();
    expect(screen.getByText('Studio A')).toBeInTheDocument();
    expect(await screen.findByText('Hall')).toBeInTheDocument();
    expect(await screen.findByText(/Anna Rossi/)).toBeInTheDocument();
    expect(screen.getAllByText('venueSpaces.inactive').length).toBe(2);
  });

  it('posts a new location with the default Rome timezone', async () => {
    renderPanel();
    await screen.findByText(/Via Roma 1/);
    const form = screen.getByRole('form', { name: 'gym.addLocation' });
    const field = (label: string) => within(form).getByLabelText(label);
    expect(field('gym.timezone')).toHaveValue('Europe/Rome');
    fireEvent.change(field('gym.location'), { target: { value: 'South' } });
    fireEvent.change(field('gym.address'), { target: { value: 'Via Nizza 9' } });
    fireEvent.change(field('gym.city'), { target: { value: 'Torino' } });
    fireEvent.click(within(form).getByRole('button', { name: 'gym.addLocation' }));
    await waitFor(() => expect(mocks.venueCall).toHaveBeenCalledWith('saveGymSpace', {
      kind: 'location', venueId: 'v1', name: 'South', address: 'Via Nizza 9', city: 'Torino',
      timezone: 'Europe/Rome', isActive: true,
    }));
  });

  it('posts a new room under the chosen location', async () => {
    renderPanel();
    await screen.findByText(/Via Roma 1/);
    const form = screen.getByRole('form', { name: 'gym.addRoom' });
    fireEvent.change(within(form).getByLabelText('gym.room'), { target: { value: 'Studio B' } });
    fireEvent.click(within(form).getByRole('button', { name: 'gym.addRoom' }));
    await waitFor(() => expect(mocks.venueCall).toHaveBeenCalledWith('saveGymSpace', {
      kind: 'room', venueId: 'v1', locationId: 'l1', name: 'Studio B', isActive: true,
    }));
  });

  it('disables adding a room while the venue has no active location', async () => {
    mocks.locations = [closed];
    renderPanel();
    await screen.findByText('Old site');
    const form = screen.getByRole('form', { name: 'gym.addRoom' });
    expect(within(form).getByRole('button', { name: 'gym.addRoom' })).toBeDisabled();
  });

  it('deactivates a location and a room, and reactivates an inactive one', async () => {
    renderPanel();
    await screen.findByText(/Via Roma 1/);
    const northRow = screen.getByText(/Via Roma 1/).closest('li')!;
    fireEvent.click(within(northRow).getAllByRole('button', { name: /venueSpaces.deactivate/ })[0]);
    await waitFor(() => expect(mocks.venueCall).toHaveBeenCalledWith('saveGymSpace', {
      kind: 'location', venueId: 'v1', id: 'l1', name: 'North', address: 'Via Roma 1', city: 'Torino',
      timezone: 'Europe/Rome', isActive: false,
    }));
    fireEvent.click(screen.getByRole('button', { name: /venueSpaces.deactivate.*Studio A/ }));
    await waitFor(() => expect(mocks.venueCall).toHaveBeenCalledWith('saveGymSpace', {
      kind: 'room', venueId: 'v1', locationId: 'l1', id: 'r1', name: 'Studio A', isActive: false,
    }));
    fireEvent.click(screen.getByRole('button', { name: /venueSpaces.activate.*Old site/ }));
    await waitFor(() => expect(mocks.venueCall).toHaveBeenCalledWith('saveGymSpace',
      expect.objectContaining({ kind: 'location', id: 'l2', isActive: true })));
  });

  it('shows a server error through the course error catalog', async () => {
    mocks.venueCall.mockRejectedValue(Object.assign(new Error('venue_authorization_required'), { code: 'functions/permission-denied' }));
    renderPanel();
    await screen.findByText(/Via Roma 1/);
    const form = screen.getByRole('form', { name: 'gym.addRoom' });
    fireEvent.change(within(form).getByLabelText('gym.room'), { target: { value: 'Studio B' } });
    fireEvent.click(within(form).getByRole('button', { name: 'gym.addRoom' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('courses.err.venue_authorization_required');
  });

  it('shows the empty hint when the venue has no location yet', async () => {
    mocks.locations = [];
    renderPanel();
    expect(await screen.findByText('venueSpaces.empty')).toBeInTheDocument();
  });

  it('is hidden from someone who does not manage the venue', () => {
    mocks.managed = [{ id: 'other' }];
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it('is shown to an admin who does not manage the venue', async () => {
    mocks.managed = [];
    mocks.role = 'admin';
    renderPanel();
    expect(await screen.findByText(/Via Roma 1/)).toBeInTheDocument();
  });
});
