import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  getProviderClients: vi.fn(),
  fetchProviderServices: vi.fn(),
  fetchProviderSlots: vi.fn(),
  createBookingAsTrainer: vi.fn(),
  addClientByEmail: vi.fn(),
  inviteClientToPlatform: vi.fn(),
}));

vi.mock('@/lib/firebase/provider', () => ({ getProviderClients: h.getProviderClients }));
vi.mock('@/lib/firebase/providers', () => ({ fetchProviderServices: h.fetchProviderServices }));
vi.mock('@/lib/firebase/availability', () => ({ fetchProviderSlots: h.fetchProviderSlots }));
vi.mock('@/lib/firebase/functions', () => ({
  createBookingAsTrainer: h.createBookingAsTrainer,
  addClientByEmail: h.addClientByEmail,
  inviteClientToPlatform: h.inviteClientToPlatform,
}));

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

  it('explains an empty roster and opens straight on "Nuovo cliente (email)"', async () => {
    h.getProviderClients.mockResolvedValue([]);
    renderSheet();
    expect(await screen.findByText(/Non hai ancora clienti/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuovo cliente (email)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Email del cliente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aggiungi' })).toBeDisabled();
  });

  it('says why Aggiungi is disabled, listing only what is still missing', async () => {
    renderSheet();
    fireEvent.change(await screen.findByLabelText('Cliente'), { target: { value: 'u-anna' } });
    expect(screen.getByText("Per aggiungere l'appuntamento manca: il servizio, l'orario.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Servizio'), { target: { value: 'svc-pt' } });
    fireEvent.click(await screen.findByRole('button', { name: '10:00' }));
    expect(screen.queryByText(/Per aggiungere l'appuntamento manca/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Aggiungi' })).toBeEnabled();
  });

  it('adds a client by email, preselects them and books them', async () => {
    h.getProviderClients.mockResolvedValueOnce([]).mockResolvedValue([
      { id: 'trainer-1_u-luca', userId: 'u-luca', name: 'Luca Verdi', email: 'luca@example.com', totalBookings: 0, totalSpent: 0 },
    ]);
    h.addClientByEmail.mockResolvedValue({
      status: 'added',
      alreadyClient: false,
      client: { id: 'trainer-1_u-luca', userId: 'u-luca', name: 'Luca Verdi', email: 'luca@example.com' },
    });
    const props = renderSheet();
    fireEvent.change(await screen.findByLabelText('Email del cliente'), { target: { value: ' Luca@Example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerca e aggiungi' }));

    expect(await screen.findByText('Luca Verdi è ora tra i tuoi clienti.')).toBeInTheDocument();
    expect(h.addClientByEmail).toHaveBeenCalledWith('luca@example.com');
    await waitFor(() => expect(h.getProviderClients).toHaveBeenCalledTimes(2));
    // On "Cliente esistente" the new client is the one selected.
    fireEvent.click(screen.getByRole('button', { name: 'Cliente esistente' }));
    await waitFor(() => expect(screen.getByLabelText('Cliente')).toHaveValue('u-luca'));

    fireEvent.change(screen.getByLabelText('Servizio'), { target: { value: 'svc-pt' } });
    fireEvent.click(await screen.findByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }));
    await waitFor(() => expect(props.onCreated).toHaveBeenCalled());
    expect(h.createBookingAsTrainer).toHaveBeenCalledWith({ clientUserId: 'u-luca', serviceId: 'svc-pt', startsAt: SLOT.startsAt });

  });

  it('offers the invitation only as an explicit choice when the email has no account', async () => {
    h.addClientByEmail.mockResolvedValue({ status: 'not_found' });
    h.inviteClientToPlatform.mockResolvedValue({ status: 'invited' });
    renderSheet();
    await screen.findByLabelText('Cliente');
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo cliente (email)' }));
    fireEvent.change(screen.getByLabelText('Email del cliente'), { target: { value: 'nuovo@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerca e aggiungi' }));

    expect(await screen.findByText('Non ha ancora un account VFit.')).toBeInTheDocument();
    expect(h.inviteClientToPlatform).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Invita a unirsi a VFit' }));
    expect(await screen.findByText(/Invito inviato/)).toBeInTheDocument();
    expect(h.inviteClientToPlatform).toHaveBeenCalledWith('nuovo@example.com');
  });

  it('maps server refusals to messages', async () => {
    renderSheet();
    await screen.findByLabelText('Cliente');
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo cliente (email)' }));
    const field = screen.getByLabelText('Email del cliente');

    fireEvent.change(field, { target: { value: 'non-una-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerca e aggiungi' }));
    expect(await screen.findByText('Inserisci un indirizzo email valido.')).toBeInTheDocument();
    expect(h.addClientByEmail).not.toHaveBeenCalled();

    h.addClientByEmail.mockRejectedValueOnce(Object.assign(new Error('rate_limited'), { code: 'functions/resource-exhausted' }));
    fireEvent.change(field, { target: { value: 'a@b.it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerca e aggiungi' }));
    expect(await screen.findByText(/limite di clienti aggiunti/)).toBeInTheDocument();

    h.addClientByEmail.mockRejectedValueOnce(Object.assign(new Error('self'), { code: 'functions/invalid-argument' }));
    fireEvent.change(field, { target: { value: 'me@b.it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerca e aggiungi' }));
    expect(await screen.findByText('Non puoi aggiungere te stesso come cliente.')).toBeInTheDocument();
  });

  it('"Blocca solo l\'orario" hands over to the block sheet for the chosen day', async () => {
    const onSwitchToBlock = vi.fn();
    renderSheet({ onSwitchToBlock });
    await screen.findByLabelText('Cliente');
    fireEvent.click(screen.getByRole('button', { name: "Blocca solo l'orario" }));
    expect(onSwitchToBlock).toHaveBeenCalledWith('2099-01-05');
  });

  it('closes on Escape and via Annulla', async () => {
    const props = renderSheet();
    await screen.findByLabelText('Cliente');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
