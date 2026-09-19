import type { UserFilters } from '@/types/admin';

export const DEFAULT_USER_FILTERS: UserFilters = {
  role: 'all',
  status: 'all',
  search: '',
  page: 1,
  limit: 20,
};

const ROLES = ['all', 'superadmin', 'admin', 'provider', 'customer'] as const;
const STATUSES = ['all', 'active', 'suspended'] as const;

/** sessionStorage key holding the list's last query, so leaving a user's page returns to it. */
export const USERS_LIST_QUERY_KEY = 'admin.users.listQuery';

/**
 * The /admin/users filters live in the URL so a reload keeps them. Unknown values fall
 * back to the defaults rather than reaching the Firestore query.
 */
export function filtersFromParams(params: URLSearchParams): UserFilters {
  const role = params.get('role');
  const status = params.get('status');
  const page = Number(params.get('page'));
  return {
    ...DEFAULT_USER_FILTERS,
    search: params.get('q') ?? '',
    role: (ROLES as readonly string[]).includes(role ?? '') ? (role as UserFilters['role']) : 'all',
    status: (STATUSES as readonly string[]).includes(status ?? '')
      ? (status as UserFilters['status'])
      : 'all',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** The inverse of filtersFromParams; defaults are omitted to keep the URL clean. */
export function queryFromFilters(filters: UserFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.role && filters.role !== 'all') params.set('role', filters.role);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  return params.toString();
}

/** Where "back to users" should go: the list as it was last filtered in this tab. */
export function usersListHref(): string {
  let query = '';
  try {
    query = sessionStorage.getItem(USERS_LIST_QUERY_KEY) ?? '';
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the bare list is fine.
  }
  return query ? `/admin/users/?${query}` : '/admin/users/';
}
