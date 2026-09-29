import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useMyLocation = vi.fn();
vi.mock('@/hooks/useMyLocation', () => ({ useMyLocation: (uid: string | undefined) => useMyLocation(uid) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: { user: { id: string } }) => unknown) => sel({ user: { id: 'u1' } }),
}));

import { MissingLocationBanner, DISMISS_KEY } from './MissingLocationBanner';

beforeEach(() => {
  useMyLocation.mockReset();
  window.sessionStorage.clear();
});

describe('MissingLocationBanner', () => {
  it('nudges a provider without coordinates to the location editor', () => {
    useMyLocation.mockReturnValue({ data: { coords: null, city: '' } });
    render(<MissingLocationBanner />);
    const link = screen.getByRole('link', {
      name: /Aggiungi la tua posizione per comparire nelle ricerche vicino a te/,
    });
    expect(link).toHaveAttribute('href', '/provider/location');
    expect(useMyLocation).toHaveBeenCalledWith('u1');
  });

  it('renders nothing once the provider has a location, or has no profile', () => {
    useMyLocation.mockReturnValue({ data: { coords: { lat: 45, lng: 9 }, city: 'Milano' } });
    const { container, rerender } = render(<MissingLocationBanner />);
    expect(container).toBeEmptyDOMElement();

    useMyLocation.mockReturnValue({ data: null });
    rerender(<MissingLocationBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('can be dismissed for the session, and stays dismissed on remount in that session', () => {
    useMyLocation.mockReturnValue({ data: { coords: null, city: '' } });
    const { unmount } = render(<MissingLocationBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Nascondi per ora' }));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(DISMISS_KEY)).toBe('1');
    unmount();

    render(<MissingLocationBanner />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('comes back in a new session', () => {
    useMyLocation.mockReturnValue({ data: { coords: null, city: '' } });
    window.sessionStorage.removeItem(DISMISS_KEY);
    render(<MissingLocationBanner />);
    expect(screen.getByRole('region', { name: 'Posizione mancante' })).toBeInTheDocument();
  });
});
