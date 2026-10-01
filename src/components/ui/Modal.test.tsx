import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

function Dialog({ onClose, closeOnBackdrop }: { onClose: () => void; closeOnBackdrop?: boolean }) {
  return (
    <Modal onClose={onClose} labelledBy="dlg-title" closeOnBackdrop={closeOnBackdrop}>
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

  it('closes on a backdrop click but not on a click inside the box', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(screen.getByLabelText('Name'));
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    // The backdrop layer sits right before the box and covers everything around it.
    fireEvent.click(dialog.previousElementSibling as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a backdrop click when closeOnBackdrop is false', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} closeOnBackdrop={false} />);
    fireEvent.click(screen.getByRole('dialog').previousElementSibling as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
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

  it('returns focus to returnFocusRef when given', () => {
    const opener = document.createElement('button');
    const menuButton = document.createElement('button');
    document.body.append(opener, menuButton);
    opener.focus();
    const ref = { current: menuButton };
    const { unmount } = render(
      <Modal onClose={vi.fn()} ariaLabel="Edit" returnFocusRef={ref}>
        <button type="button">Save</button>
      </Modal>
    );
    unmount();
    expect(menuButton).toHaveFocus();
    opener.remove();
    menuButton.remove();
  });

  it('is described by describedBy', () => {
    render(
      <Modal onClose={vi.fn()} labelledBy="d-title" describedBy="d-body">
        <h3 id="d-title">Cancel booking</h3>
        <p id="d-body">Are you sure?</p>
        <button type="button">Keep</button>
      </Modal>
    );
    expect(screen.getByRole('dialog', { name: 'Cancel booking' })).toHaveAccessibleDescription('Are you sure?');
  });
});
