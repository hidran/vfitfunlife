import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

function Dialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} labelledBy="dlg-title">
      <h3 id="dlg-title">Edit service</h3>
      <label htmlFor="dlg-name">Name</label>
      <input id="dlg-name" />
      <button type="button">Save</button>
    </Modal>
  );
}

describe('Modal', () => {
  it('is a labelled modal dialog and focuses its first field', () => {
    render(<Dialog onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Edit service' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab and Shift+Tab inside the dialog', () => {
    render(<Dialog onClose={vi.fn()} />);
    const name = screen.getByLabelText('Name');
    const save = screen.getByRole('button', { name: 'Save' });

    save.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(name).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(save).toHaveFocus();
  });

  it('returns focus to the opener when it closes', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<Dialog onClose={vi.fn()} />);
    expect(opener).not.toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
