import type { ProviderFilters } from '@/types/admin';

export const DEFAULT_PROVIDER_FILTERS: ProviderFilters = {
  verificationStatus: 'all',
  status: 'all',
  search: '',
  page: 1,
  limit: 20,
};

const VERIFICATIONS = ['all', 'verified', 'pending', 'rejected'] as const;
const STATUSES = ['all', 'active', 'suspended'] as const;

/** sessionStorage key holding the list's last query, so leaving a provider's page returns to it. */
export const PROVIDERS_LIST_QUERY_KEY = 'admin.providers.listQuery';

/**
 * The /admin/providers filters live in the URL so a reload keeps them — same contract as
 * usersListQuery. Unknown values fall back to the defaults rather than reaching the query.
 */
export function providerFiltersFromParams(params: URLSearchParams): ProviderFilters {
  const verification = params.get('verification');
  const status = params.get('status');
  const page = Number(params.get('page'));
  return {
    ...DEFAULT_PROVIDER_FILTERS,
    search: params.get('q') ?? '',
    verificationStatus: (VERIFICATIONS as readonly string[]).includes(verification ?? '')
      ? (verification as ProviderFilters['verificationStatus'])
      : 'all',
    status: (STATUSES as readonly string[]).includes(status ?? '')
      ? (status as ProviderFilters['status'])
      : 'all',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** The inverse of providerFiltersFromParams; defaults are omitted to keep the URL clean. */
export function queryFromProviderFilters(filters: ProviderFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.verificationStatus && filters.verificationStatus !== 'all') {
    params.set('verification', filters.verificationStatus);
  }
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  return params.toString();
}

/** Where "back to providers" should go: the list as it was last filtered in this tab. */
export function providersListHref(): string {
  let query = '';
  try {
    query = sessionStorage.getItem(PROVIDERS_LIST_QUERY_KEY) ?? '';
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the bare list is fine.
  }
  return query ? `/admin/providers/?${query}` : '/admin/providers/';
}
