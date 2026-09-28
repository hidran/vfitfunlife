import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROVIDER_FILTERS,
  providerFiltersFromParams,
  queryFromProviderFilters,
} from './providersListQuery';

describe('providers list query', () => {
  it('writes nothing for the default filters', () => {
    expect(queryFromProviderFilters(DEFAULT_PROVIDER_FILTERS)).toBe('');
  });

  it('round-trips search, verification, status and page through the URL', () => {
    const filters = {
      ...DEFAULT_PROVIDER_FILTERS,
      search: 'anna bianchi',
      verificationStatus: 'rejected' as const,
      status: 'suspended' as const,
      page: 2,
    };
    const qs = queryFromProviderFilters(filters);

    expect(qs).toBe('q=anna+bianchi&verification=rejected&status=suspended&page=2');
    expect(providerFiltersFromParams(new URLSearchParams(qs))).toEqual(filters);
  });

  it('round-trips an allowed page size', () => {
    const filters = { ...DEFAULT_PROVIDER_FILTERS, limit: 10 };
    expect(queryFromProviderFilters(filters)).toBe('size=10');
    expect(providerFiltersFromParams(new URLSearchParams('size=10'))).toEqual(filters);
  });

  it('ignores values it does not recognise rather than passing them to the query', () => {
    expect(
      providerFiltersFromParams(new URLSearchParams('verification=maybe&status=hidden&page=0'))
    ).toEqual(DEFAULT_PROVIDER_FILTERS);
  });
});
