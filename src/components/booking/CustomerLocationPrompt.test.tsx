import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  getDevicePosition: vi.fn(),
}));

vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useCustomerSearchLocation', () => ({
  useSaveCustomerSearchLocation: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));
vi.mock('@/lib/deviceLocation', () => ({ getDevicePosition: mocks.getDevicePosition }));

import { CustomerLocationPrompt } from './CustomerLocationPrompt';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CustomerLocationPrompt', () => {
  it('does not access device location until the customer explicitly saves', () => {
    render(<CustomerLocationPrompt open onDismiss={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.getDevicePosition).not.toHaveBeenCalled();
  });

  it('saves the device location and dismisses after success', async () => {
    const coords = { lat: 45.46, lng: 9.19 };
    const onDismiss = vi.fn();
    mocks.getDevicePosition.mockResolvedValue(coords);
    mocks.mutateAsync.mockResolvedValue({ coords, geohash: 'abc' });
    render(<CustomerLocationPrompt open onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'booking.locationPrompt.save' }));

    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce());
    expect(mocks.getDevicePosition).toHaveBeenCalledOnce();
    expect(mocks.mutateAsync).toHaveBeenCalledWith(coords);
  });

  it('shows an error and leaves the prompt open if location cannot be saved', async () => {
    mocks.getDevicePosition.mockRejectedValue(new Error('permission-denied'));
    const onDismiss = vi.fn();
    render(<CustomerLocationPrompt open onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'booking.locationPrompt.save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('booking.locationPrompt.error');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('allows the customer to skip saving', () => {
    const onDismiss = vi.fn();
    render(<CustomerLocationPrompt open onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'booking.locationPrompt.notNow' }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(mocks.getDevicePosition).not.toHaveBeenCalled();
  });
});
