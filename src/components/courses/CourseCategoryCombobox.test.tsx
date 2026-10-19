import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CourseCategoryCombobox } from './CourseCategoryCombobox';
const categories = [{ id: 'y', name: 'Yoga' }, { id: 'm', name: 'Massaggio' }, { id: 'a', name: 'Arti Marziali' }];
describe('course category combobox', () => {
  it('sorts translated labels and filters by typing, keeping category IDs', () => {
    const change = vi.fn();
    render(<CourseCategoryCombobox categories={categories} locale="it" label="Categoria" placeholder="Seleziona" value="" onChange={change} />);
    const input = screen.getByRole('combobox', { name: 'Categoria' });
    fireEvent.focus(input);
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Arti Marziali', 'Massaggio', 'Yoga']);
    fireEvent.change(input, { target: { value: 'mass' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenLastCalledWith('m');
  });
  it('clears stale selections when typing and closes without submitting on Escape', () => {
    const change = vi.fn();
    render(<CourseCategoryCombobox categories={categories} locale="it" label="Categoria" placeholder="Seleziona" value="y" onChange={change} />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveValue('Yoga');
    fireEvent.change(input, { target: { value: 'invalid' } });
    expect(change).toHaveBeenCalledWith('');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
