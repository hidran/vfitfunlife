import { describe, it, expect } from 'vitest';
import { filtersFromParams, queryFromFilters, DEFAULT_USER_FILTERS } from './usersListQuery';

describe('users list query', () => {
  it('writes nothing for the default filters', () => {
    expect(queryFromFilters(DEFAULT_USER_FILTERS)).toBe('');
  });

  it('round-trips search, role, status and page through the URL', () => {
    const filters = { ...DEFAULT_USER_FILTERS, search: 'mario rossi', role: 'provider' as const, status: 'suspended' as const, page: 3 };
    const qs = queryFromFilters(filters);

    expect(filtersFromParams(new URLSearchParams(qs))).toEqual(filters);
  });

  it('ignores values it does not recognise rather than passing them to the query', () => {
    const filters = filtersFromParams(new URLSearchParams('role=root&status=weird&page=-4'));

    expect(filters).toEqual(DEFAULT_USER_FILTERS);
  });
});
