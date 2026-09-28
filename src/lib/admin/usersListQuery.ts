import type { UserFilters } from '@/types/admin';

export const DEFAULT_USER_FILTERS: UserFilters = {
  role: 'all',
  status: 'all',
  search: '',
  page: 1,
  limit: 20,
};

const ROLES = ['all', 'superadmin', 'admin', 'provider', 'customer'] as const;
const STATUSES = ['all', 'active', 'suspended', 'hidden'] as const;

/**
 * Page sizes a list URL may ask for (`?size=`); anything else falls back to the list's default.
 * Pages are server-side (one limit(size) query per page), so the size is bounded.
 */
export const PAGE_SIZES = [5, 10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;
/** What the admin tables' page-size selector offers (a subset of PAGE_SIZES). */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function pageSizeFromParams(params: URLSearchParams, fallback: number = DEFAULT_PAGE_SIZE): number {
  const size = Number(params.get('size'));
  return (PAGE_SIZES as readonly number[]).includes(size) ? size : fallback;
}

/** `?page=` as a positive integer, 1 for anything else. */
export function pageFromParams(params: URLSearchParams): number {
  const page = Number(params.get('page'));
  return Number.isInteger(page) && page > 1 ? page : 1;
}

/** `yyyy-mm-dd` of a date in local time — what an <input type="date"> and our URLs carry. */
export function toDateParam(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A `yyyy-mm-dd` URL value as a local Date: the start of that day, or with `endOfDay` its
 * last millisecond (so a "to" date includes the whole day). Malformed values give undefined.
 */
export function fromDateParam(value: string | null, endOfDay = false): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const date = endOfDay ? new Date(y, mo, d, 23, 59, 59, 999) : new Date(y, mo, d);
  return date.getFullYear() === y && date.getMonth() === mo && date.getDate() === d ? date : undefined;
}

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
    limit: pageSizeFromParams(params),
  };
}

/** The inverse of filtersFromParams; defaults are omitted to keep the URL clean. */
export function queryFromFilters(filters: UserFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.role && filters.role !== 'all') params.set('role', filters.role);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (filters.limit && filters.limit !== DEFAULT_PAGE_SIZE) params.set('size', String(filters.limit));
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
