import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DataTable, sortRows, type Column } from './DataTable';

type Row = { id: string; name: string; joinedAt?: Date | null; profile?: { rating?: number } };

const rows: Row[] = [
  { id: 'b', name: 'bruno', joinedAt: new Date('2026-02-01'), profile: { rating: 4.5 } },
  { id: 'a', name: 'Anna', joinedAt: null, profile: {} },
  { id: 'c', name: 'carla', joinedAt: new Date('2026-01-01'), profile: { rating: 3 } },
];

describe('sortRows', () => {
  it('sorts dates and numbers by value, nulls last in both directions', () => {
    const byJoined = (r: Row) => r.joinedAt;
    expect(sortRows(rows, byJoined, 'asc').map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(sortRows(rows, byJoined, 'desc').map((r) => r.id)).toEqual(['b', 'c', 'a']);

    const byRating = (r: Row) => r.profile?.rating;
    expect(sortRows(rows, byRating, 'desc').map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts strings case-insensitively and does not mutate the input', () => {
    const copy = [...rows];
    expect(sortRows(rows, (r) => r.name, 'asc').map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(rows).toEqual(copy);
  });
});

describe('DataTable sorting', () => {
  // `key` is a column id, not a row field — the case that silently never sorted before.
  const columns: Column<Row>[] = [
    { key: 'user', header: 'User', cell: (r) => r.name, sortValue: (r) => r.name },
    { key: 'joined', header: 'Joined', cell: (r) => r.joinedAt?.toISOString() ?? '-', sortValue: (r) => r.joinedAt },
    { key: 'actions', header: 'Actions', cell: () => 'x' },
  ];

  const renderedIds = () =>
    Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.firstElementChild?.textContent);

  it('sorts by the column accessor: asc, desc, then back to the original order', () => {
    render(<DataTable data={rows} columns={columns} keyExtractor={(r) => r.id} />);

    fireEvent.click(screen.getByText('Joined'));
    expect(renderedIds()).toEqual(['carla', 'bruno', 'Anna']);
    fireEvent.click(screen.getByText('Joined'));
    expect(renderedIds()).toEqual(['bruno', 'carla', 'Anna']);
    fireEvent.click(screen.getByText('Joined'));
    expect(renderedIds()).toEqual(['bruno', 'Anna', 'carla']);
  });

  it('marks the sorted column for assistive tech and leaves accessor-less columns inert', () => {
    render(<DataTable data={rows} columns={columns} keyExtractor={(r) => r.id} />);

    fireEvent.click(screen.getByText('User'));
    expect(screen.getByText('User').closest('th')).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.click(screen.getByText('Actions'));
    expect(screen.getByText('Actions').closest('th')).not.toHaveAttribute('aria-sort');
    expect(renderedIds()).toEqual(['Anna', 'bruno', 'carla']);
  });
});
