import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  getProviderClients: vi.fn(),
  fetchProviderServices: vi.fn(),
  fetchProviderSlots: vi.fn(),
  createBookingAsTrainer: vi.fn(),
}));

vi.mock('@/lib/firebase/provider', () => ({ getProviderClients: h.getProviderClients }));
vi.mock('@/lib/firebase/providers', () => ({ fetchProviderServices: h.fetchProviderServices }));
vi.mock('@/lib/firebase/availability', () => ({ fetchProviderSlots: h.fetchProviderSlots }));
vi.mock('@/lib/firebase/functions', () => ({ createBookingAsTrainer: h.createBookingAsTrainer }));

import { AddAppointmentSheet } from './AddAppointmentSheet';

const SLOT = { time: '10:00', startsAt: '2099-01-05T09:00:00.000Z' };

beforeEach(() => {
  vi.clearAllMocks();
  h.getProviderClients.mockResolvedValue([
    { id: 'c1', userId: 'u-anna', name: 'Anna Rossi', email: 'anna@example.com', totalBookings: 1, totalSpent: 0 },
    // Same person twice (seeded + derived roster doc) must show once; a doc without userId never.
    { id: 'c2', userId: 'u-anna', name: 'Anna Rossi', email: 'anna@example.com', totalBookings: 1, totalSpent: 0 },
    { id: 'c3', userId: '', name: 'Senza account', email: '', totalBookings: 0, totalSpent: 0 },
  ]);
  h.fetchProviderServices.mockResolvedValue([
    { id: 'svc-pt', name: 'Personal training', durationMinutes: 60, price: 50, isActive: true },
    { id: 'svc-old', name: 'Vecchio', durationMinutes: 30, price: 20, isActive: false },
  ]);
  h.fetchProviderSlots.mockResolvedValue([SLOT, { time: '10:30', startsAt: '2099-01-05T09:30:00.000Z' }]);
  h.createBookingAsTrainer.mockResolvedValue({ bookingId: 'bk-1', finalPrice: 50 });
});

function renderSheet(overrides: Partial<Parameters<typeof AddAppointmentSheet>[0]> = {}) {
  const props = {
    instructorId: 'trainer-1',
    initialDate: '2099-01-05',
    onClose: vi.fn(),
    onCreated: vi.fn(),
    ...overrides,
  };
  render(<AddAppointmentSheet {...props} />);
  return props;
}

describe('AddAppointmentSheet', () => {
  it('is a labelled modal dialog listing the roster (deduped) and the active services', async () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: 'Nuovo appuntamento' })).toHaveAttribute('aria-modal', 'true');

    const client = await screen.findByLabelText('Cliente');
    expect(Array.from((client as HTMLSelectElement).options).map((o) => o.textContent))
      .toEqual(['Scegli un cliente', 'Anna Rossi']);
    const service = screen.getByLabelText('Servizio') as HTMLSelectElement;
    expect(Array.from(service.options).map((o) => o.value)).toEqual(['', 'svc-pt']);
    expect(screen.getByLabelText('Data')).toHaveValue('2099-01-05');
    expect(h.fetchProviderServices).toHaveBeenCalledWith('trainer-1');
  });

  it('asks for the free slots as the trainer and books the chosen one', async () => {
    const props = renderSheet();
    const add = screen.getByRole('button', { name: 'Aggiungi' });
    expect(add).toBeDisabled();

    fireEvent.change(await screen.findByLabelText('Cliente'), { target: { value: 'u-anna' } });
    fireEvent.change(screen.getByLabelText('Servizio'), { target: { value: 'svc-pt' } });
    expect(h.fetchProviderSlots).toHaveBeenCalledWith({
      instructorId: 'trainer-1',
      serviceId: 'svc-pt',
      date: '2099-01-05',
      asTrainer: true,
    });
    expect(add).toBeDisabled(); // no time picked yet

    fireEvent.click(await screen.findByRole('button', { name: '10:00' }));
    fireEvent.change(screen.getByLabelText('Nota (facoltativa, visibile solo a te)'), {
      target: { value: '  porta i guanti  ' },
    });
    fireEvent.click(add);

    await waitFor(() => expect(props.onCreated).toHaveBeenCalled());
    expect(h.createBookingAsTrainer).toHaveBeenCalledWith({
      clientUserId: 'u-anna',
      serviceId: 'svc-pt',
      startsAt: SLOT.startsAt,
      note: 'porta i guanti',
    });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('says so and reloads the times when the slot was taken meanwhile', async () => {
    h.createBookingAsTrainer.mockRejectedValue(Object.assign(new Error('slot_unavailable'), { code: 'functions/failed-precondition' }));
    const props = renderSheet();
    fireEvent.change(await screen.findByLabelText('Cliente'), { target: { value: 'u-anna' } });
    fireEvent.change(screen.getByLabelText('Servizio'), { target: { value: 'svc-pt' } });
    fireEvent.click(await screen.findByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }));

    expect(await screen.findByText("Quell'orario non è più libero. Scegline un altro.")).toBeInTheDocument();
    expect(h.fetchProviderSlots).toHaveBeenCalledTimes(2);
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('explains an empty roster instead of showing an empty picker', async () => {
    h.getProviderClients.mockResolvedValue([]);
    renderSheet();
    expect(await screen.findByText(/Non hai ancora clienti/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aggiungi' })).toBeDisabled();
  });

  it('closes on Escape and via Annulla', async () => {
    const props = renderSheet();
    await screen.findByLabelText('Cliente');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
