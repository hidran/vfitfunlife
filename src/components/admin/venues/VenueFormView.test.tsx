import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { VenueFormView } from './VenueFormView';

describe('VenueFormView', () => {
  it('offers every venue type, labelled with the shared admin.venues.filter.* messages', () => {
    render(<VenueFormView mode="create" onSubmit={() => undefined} />);

    const select = screen.getByLabelText('Tipo') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual([
      ['gym', 'Palestra'],
      ['school', 'Scuola'],
      ['studio', 'Studio'],
      ['wellness_center', 'Centro benessere'],
      ['beauty_salon', 'Salone di bellezza'],
      ['outdoor_space', 'Spazio outdoor'],
      ['event_space', 'Spazio eventi'],
    ]);
  });

  it('keeps a school venue selected when editing it', () => {
    render(
      <VenueFormView mode="edit" initial={{ type: 'school', name: 'Scuola Rossi' }} onSubmit={() => undefined} />,
    );
    expect(screen.getByLabelText('Tipo')).toHaveValue('school');
  });
});
