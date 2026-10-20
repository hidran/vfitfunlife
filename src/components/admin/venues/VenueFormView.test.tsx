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

describe('VenueFormView location defaults', () => {
  it('pre-fills from the canonical shape: string address plus top-level city, zipCode, country', () => {
    render(
      <VenueFormView
        mode="edit"
        initial={{ name: 'Gym', address: 'Via Po 2', city: 'Torino', zipCode: '10100', country: 'IT' } as never}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByLabelText('Via')).toHaveValue('Via Po 2');
    expect(screen.getByLabelText('Città')).toHaveValue('Torino');
    expect(screen.getByLabelText('CAP')).toHaveValue('10100');
  });

  it('still pre-fills from a legacy object address', () => {
    render(
      <VenueFormView
        mode="edit"
        initial={
          { name: 'Gym', address: { street: 'Via Po 2', city: 'Torino', zipCode: '10100', country: 'IT' } } as never
        }
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByLabelText('Via')).toHaveValue('Via Po 2');
    expect(screen.getByLabelText('Città')).toHaveValue('Torino');
    expect(screen.getByLabelText('CAP')).toHaveValue('10100');
  });
});
