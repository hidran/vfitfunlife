import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';

describe('ConfirmDeleteDialog', () => {
  it('forgets the typed name and reason after Cancel, so a reopen is not pre-armed', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ConfirmDeleteDialog open entityLabel="utenti" entityName="7" onClose={onClose} onConfirm={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText(/Digita/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'pulizia test' } });
    expect(screen.getByRole('button', { name: 'Elimina definitivamente' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onClose).toHaveBeenCalled();

    // The parent closes then reopens the dialog for the same entityName (e.g. a
    // page-sized selection count of "7" again) — same component instance, state persists
    // unless Cancel reset it.
    rerender(<ConfirmDeleteDialog open={false} entityLabel="utenti" entityName="7" onClose={onClose} onConfirm={vi.fn()} />);
    rerender(<ConfirmDeleteDialog open entityLabel="utenti" entityName="7" onClose={onClose} onConfirm={vi.fn()} />);

    expect(screen.getByLabelText(/Digita/)).toHaveValue('');
    expect(screen.getByLabelText('Motivo')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Elimina definitivamente' })).toBeDisabled();
  });

  it('also forgets state via the header close button', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ConfirmDeleteDialog open entityLabel="utenti" entityName="7" onClose={onClose} onConfirm={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText(/Digita/), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(onClose).toHaveBeenCalled();

    rerender(<ConfirmDeleteDialog open={false} entityLabel="utenti" entityName="7" onClose={onClose} onConfirm={vi.fn()} />);
    rerender(<ConfirmDeleteDialog open entityLabel="utenti" entityName="7" onClose={onClose} onConfirm={vi.fn()} />);

    expect(screen.getByLabelText(/Digita/)).toHaveValue('');
  });
});
