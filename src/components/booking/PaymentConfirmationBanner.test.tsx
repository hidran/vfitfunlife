import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { BookingPaymentConfirmation } from '@/types/firebase';
import { PaymentConfirmationBanner } from './PaymentConfirmationBanner';

function confirmation(over: Partial<BookingPaymentConfirmation> = {}): BookingPaymentConfirmation {
  return {
    method: 'cash',
    amount: 50,
    confirmedByTrainerAt: Timestamp.fromDate(new Date('2026-10-05T10:00:00Z')),
    clientResponse: null,
    clientRespondedAt: null,
    autoConfirmed: false,
    ...over,
  };
}

describe('PaymentConfirmationBanner — service received (+XP)', () => {
  it('offers a prominent "service received (+50 XP)" action', async () => {
    const onRespond = vi.fn().mockResolvedValue(undefined);
    render(<PaymentConfirmationBanner confirmation={confirmation()} onRespond={onRespond} />);

    fireEvent.click(screen.getByRole('button', { name: /Conferma servizio ricevuto \(\+50 XP\)/ }));
    await waitFor(() => expect(onRespond).toHaveBeenCalledWith('confirmed', undefined));
  });

  it('lets the client dispute with a reason instead', async () => {
    const onRespond = vi.fn().mockResolvedValue(undefined);
    render(<PaymentConfirmationBanner confirmation={confirmation()} onRespond={onRespond} />);

    fireEvent.click(screen.getByRole('button', { name: /problema/i }));
    fireEvent.change(screen.getByLabelText(/Cosa non torna/), { target: { value: ' Mai svolta ' } });
    fireEvent.click(screen.getByRole('button', { name: /Invia contestazione/ }));
    await waitFor(() => expect(onRespond).toHaveBeenCalledWith('disputed', 'Mai svolta'));
  });

  it('shows an error and keeps the prompt when the call fails', async () => {
    const onRespond = vi.fn().mockRejectedValue(new Error('boom'));
    render(<PaymentConfirmationBanner confirmation={confirmation()} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole('button', { name: /\+50 XP/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+50 XP/ })).toBeEnabled();
  });

  it('still asks after a 48h auto-confirm, so the XP can be collected', () => {
    render(
      <PaymentConfirmationBanner confirmation={confirmation({ autoConfirmed: true })} onRespond={vi.fn()} />,
    );
    expect(screen.getByText(/automaticamente dopo 48 ore/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+50 XP/ })).toBeInTheDocument();
  });

  it('shows the XP earned once confirmed', () => {
    render(
      <PaymentConfirmationBanner
        confirmation={confirmation({ clientResponse: 'confirmed', xpAwarded: 50 })}
        onRespond={vi.fn()}
      />,
    );
    expect(screen.getByText('Servizio ricevuto confermato')).toBeInTheDocument();
    expect(screen.getByText('+50 XP guadagnati')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows no XP for a dispute', () => {
    render(
      <PaymentConfirmationBanner confirmation={confirmation({ clientResponse: 'disputed' })} onRespond={vi.fn()} />,
    );
    expect(screen.getByText(/contestato/)).toBeInTheDocument();
    expect(screen.queryByText(/XP/)).not.toBeInTheDocument();
  });
});
