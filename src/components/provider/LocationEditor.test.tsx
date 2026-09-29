import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDevicePosition = vi.fn();
vi.mock('@/lib/deviceLocation', () => ({ getDevicePosition: () => getDevicePosition() }));
vi.mock('@googlemaps/js-api-loader', () => ({ Loader: vi.fn() }));

import { LocationEditor } from './LocationEditor';

// No NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in tests: the editor runs in its no-map fallback
// (current location + city), which is also what a misconfigured build shows.
beforeEach(() => {
  getDevicePosition.mockReset();
  delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
});

describe('LocationEditor', () => {
  it('saves the device position with the typed city', async () => {
    getDevicePosition.mockResolvedValue({ lat: 45.4642, lng: 9.19 });
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<LocationEditor initial={{ coords: null, city: '' }} onSave={onSave} />);

    expect(screen.getByText(/Mappa non disponibile/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Usa la mia posizione attuale/ }));
    await screen.findByText('Posizione selezionata: 45.464, 9.190');

    fireEvent.change(screen.getByLabelText('Città'), { target: { value: 'Milano' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva posizione/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ lat: 45.4642, lng: 9.19, city: 'Milano' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Posizione salvata/);
  });

  it('asks for a point before saving', async () => {
    const onSave = vi.fn();
    render(<LocationEditor initial={{ coords: null, city: 'Milano' }} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Salva posizione/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Scegli prima una posizione.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('asks for the city before saving', async () => {
    const onSave = vi.fn();
    render(<LocationEditor initial={{ coords: { lat: 41.9, lng: 12.5 }, city: '' }} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Salva posizione/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Indica la città.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('explains a denied or failed geolocation', async () => {
    getDevicePosition.mockRejectedValue(new Error('permission-denied'));
    render(<LocationEditor initial={{ coords: null, city: '' }} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Usa la mia posizione attuale/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Impossibile rilevare la posizione/);
  });

  it('reports a failed save', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('permission-denied'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<LocationEditor initial={{ coords: { lat: 41.9, lng: 12.5 }, city: 'Roma' }} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Salva posizione/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Impossibile salvare la posizione/);
  });
});
