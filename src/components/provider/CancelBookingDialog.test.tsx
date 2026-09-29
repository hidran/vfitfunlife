import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CancelBookingDialog, CANCEL_REASON_MAX_LENGTH } from './CancelBookingDialog';

describe('CancelBookingDialog', () => {
  it('renders nothing when closed', () => {
    render(<CancelBookingDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is an accessible, labelled modal dialog', () => {
    render(<CancelBookingDialog open onClose={vi.fn()} onConfirm={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Annulla prenotazione' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Motivo (facoltativo)')).toBeInTheDocument();
  });

  it('passes the trimmed reason to onConfirm and then closes', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<CancelBookingDialog open onClose={onClose} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText('Motivo (facoltativo)'), {
      target: { value: '  Imprevisto, ci sentiamo per un altro orario  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Annulla prenotazione' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledWith('Imprevisto, ci sentiamo per un altro orario');
  });

  it('sends undefined when the reason is left empty (it is optional)', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<CancelBookingDialog open onClose={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText('Motivo (facoltativo)'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annulla prenotazione' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(undefined));
  });

  it('caps the reason at 500 characters and shows a counter', () => {
    render(<CancelBookingDialog open onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText(`0/${CANCEL_REASON_MAX_LENGTH}`)).toBeInTheDocument();

    const textarea = screen.getByLabelText('Motivo (facoltativo)');
    expect(textarea).toHaveAttribute('maxLength', String(CANCEL_REASON_MAX_LENGTH));
    fireEvent.change(textarea, { target: { value: 'x'.repeat(600) } });

    expect(textarea).toHaveValue('x'.repeat(CANCEL_REASON_MAX_LENGTH));
    expect(screen.getByText('500/500')).toBeInTheDocument();
  });

  it('closes without confirming via Back, the close button, and Escape', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<CancelBookingDialog open onClose={onClose} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('forgets a typed reason after Back, so a reopen starts empty', () => {
    const { rerender } = render(<CancelBookingDialog open onClose={vi.fn()} onConfirm={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Motivo (facoltativo)'), { target: { value: 'bozza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));

    rerender(<CancelBookingDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    rerender(<CancelBookingDialog open onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByLabelText('Motivo (facoltativo)')).toHaveValue('');
  });
});
