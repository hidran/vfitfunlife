import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseEditor } from './CourseEditor';
import { I18nProvider } from '@/contexts/I18nContext';
import { itMessages } from '@/i18n/messages/it';
const call = vi.hoisted(() => vi.fn());
vi.mock('@/lib/firebase/courses', () => ({ courseCall: call, saveCourse: vi.fn() }));
vi.mock('@/hooks/useServiceCategories', () => ({ useServiceCategoryLeaves: () => [{ id: 'karate', name: 'Arti Marziali' }] }));
beforeEach(() => { call.mockReset(); sessionStorage.clear(); localStorage.setItem('vfit.locale', 'it'); });
it('does not call preview with missing required inputs', () => {
  render(<CourseEditor onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper: I18nProvider });
  fireEvent.click(screen.getByRole('button', { name: itMessages['courses.preview'] }));
  expect(call).not.toHaveBeenCalled();
});
describe('course editor', () => {
  it('preserves the unsaved draft across remounts', () => {
    const props = { onSaved: vi.fn(), onClose: vi.fn(), storageKey: 'course-draft-test' };
    const first = render(<CourseEditor {...props} />, { wrapper: I18nProvider });
    fireEvent.change(screen.getByLabelText(itMessages['courses.name']), { target: { value: 'Karate beginners' } });
    first.unmount(); render(<CourseEditor {...props} />, { wrapper: I18nProvider });
    expect(screen.getByLabelText(itMessages['courses.name'])).toHaveValue('Karate beginners');
  });
  it('shows translated field guidance instead of JSON validation errors', async () => {
    call.mockRejectedValue({ message: '[{"code":"too_small"}]', details: { fields: ['capacity'] } });
    render(<CourseEditor onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper: I18nProvider });
    for (const [field, value] of [['name', 'Karate'], ['instructor', 'Anna'], ['location', 'Torino']])
      fireEvent.change(screen.getByLabelText(itMessages[`courses.${field}` as keyof typeof itMessages]), { target: { value } });
    fireEvent.focus(screen.getByRole('combobox', { name: itMessages['courses.category'] }));
    fireEvent.click(within(screen.getByRole('option', { name: 'Arti Marziali' })).getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: itMessages['courses.preview'] }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Controlla questi campi: Numero massimo di partecipanti.'));
    expect(screen.getByRole('alert')).not.toHaveTextContent('too_small');
  });
});
