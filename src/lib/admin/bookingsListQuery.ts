import type { BookingFilters } from '@/types/admin';
import type { BookingStatus } from '@/types/firebase';
import { BOOKING_STATUS_META } from '@/lib/bookingStatus';
import {
  DEFAULT_PAGE_SIZE,
  fromDateParam,
  pageFromParams,
  pageSizeFromParams,
  toDateParam,
} from './usersListQuery';

export const DEFAULT_BOOKING_FILTERS: BookingFilters = {
  status: 'all',
  search: '',
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
};

/**
 * "Disputes" is not a booking status: a dispute is the client answering the trainer's payment
 * confirmation with `paymentConfirmation.clientResponse == 'disputed'`. The status filter
 * offers it as one more option (see bookingListConstraints in lib/firebase/admin).
 */
export const BOOKING_DISPUTED_FILTER = 'disputed';

/** Every value the status filter offers — derived from the status enum so it cannot drift. */
export const BOOKING_STATUS_FILTERS: readonly string[] = [
  'all',
  ...(Object.keys(BOOKING_STATUS_META) as BookingStatus[]),
  BOOKING_DISPUTED_FILTER,
];

/**
 * The /admin/bookings filters live in the URL (same contract as usersListQuery): a reload or a
 * shared link keeps them, and unknown values fall back to the defaults rather than reaching the
 * Firestore query. `provider` / `customer` are uid deep links (e.g. from a user's page).
 */
export function bookingFiltersFromParams(params: URLSearchParams): BookingFilters {
  const status = params.get('status');
  const filters: BookingFilters = {
    ...DEFAULT_BOOKING_FILTERS,
    search: params.get('q') ?? '',
    status: status && BOOKING_STATUS_FILTERS.includes(status) ? status : 'all',
    page: pageFromParams(params),
    limit: pageSizeFromParams(params),
  };
  const dateFrom = fromDateParam(params.get('from'));
  const dateTo = fromDateParam(params.get('to'), true);
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;
  const provider = params.get('provider');
  const customer = params.get('customer');
  if (provider) filters.providerId = provider;
  if (customer) filters.customerId = customer;
  return filters;
}

/** The inverse of bookingFiltersFromParams; defaults are omitted to keep the URL clean. */
export function queryFromBookingFilters(filters: BookingFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.dateFrom) params.set('from', toDateParam(filters.dateFrom));
  if (filters.dateTo) params.set('to', toDateParam(filters.dateTo));
  if (filters.providerId) params.set('provider', filters.providerId);
  if (filters.customerId) params.set('customer', filters.customerId);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (filters.limit && filters.limit !== DEFAULT_PAGE_SIZE) params.set('size', String(filters.limit));
  return params.toString();
}
