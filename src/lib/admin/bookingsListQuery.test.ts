import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BOOKING_FILTERS,
  bookingFiltersFromParams,
  queryFromBookingFilters,
} from './bookingsListQuery';
import {
  DEFAULT_LOG_FILTERS,
  logFiltersFromParams,
  queryFromLogFilters,
} from './logsListQuery';
import { fromDateParam, toDateParam } from './usersListQuery';

describe('bookings list query', () => {
  it('writes nothing for the default filters', () => {
    expect(queryFromBookingFilters(DEFAULT_BOOKING_FILTERS)).toBe('');
  });

  it('round-trips search, status, dates, uid links, page and size', () => {
    const qs = 'q=anna%40example.com&status=disputed&from=2026-06-01&to=2026-06-30&provider=t1&customer=c1&page=3&size=50';
    const filters = bookingFiltersFromParams(new URLSearchParams(qs));

    expect(filters).toMatchObject({
      search: 'anna@example.com',
      status: 'disputed',
      providerId: 't1',
      customerId: 'c1',
      page: 3,
      limit: 50,
    });
    // The "to" day is included up to its last millisecond, in local time.
    expect(filters.dateFrom).toEqual(new Date(2026, 5, 1));
    expect(filters.dateTo).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999));
    expect(queryFromBookingFilters(filters)).toBe(qs);
  });

  it('ignores values it does not recognise rather than passing them to the query', () => {
    const filters = bookingFiltersFromParams(new URLSearchParams('status=pending&from=2026-02-31&page=-2&size=7'));
    expect(filters).toEqual(DEFAULT_BOOKING_FILTERS);
  });

  it('accepts every booking status', () => {
    for (const status of ['requested', 'accepted', 'completed', 'no_show', 'payment_confirmed']) {
      expect(bookingFiltersFromParams(new URLSearchParams(`status=${status}`)).status).toBe(status);
    }
  });
});

describe('system logs list query', () => {
  it('defaults to 50 rows and writes nothing for the defaults', () => {
    expect(DEFAULT_LOG_FILTERS.limit).toBe(50);
    expect(queryFromLogFilters(DEFAULT_LOG_FILTERS)).toBe('');
    expect(logFiltersFromParams(new URLSearchParams(''))).toEqual(DEFAULT_LOG_FILTERS);
  });

  it('round-trips severity, action, actor, dates, page and size', () => {
    const qs = 'q=uid-1&severity=error&action=SUSPEND_USER&from=2026-01-02&to=2026-01-03&page=2&size=20';
    const filters = logFiltersFromParams(new URLSearchParams(qs));
    expect(filters).toMatchObject({ search: 'uid-1', severity: 'error', action: 'SUSPEND_USER', page: 2, limit: 20 });
    expect(queryFromLogFilters(filters)).toBe(qs);
  });

  it('drops an unknown action or severity', () => {
    const filters = logFiltersFromParams(new URLSearchParams('severity=fatal&action=DROP_TABLE'));
    expect(filters.severity).toBe('all');
    expect(filters.action).toBe('all');
  });
});

describe('date params', () => {
  it('are local calendar days both ways', () => {
    expect(toDateParam(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(fromDateParam('2026-01-05')).toEqual(new Date(2026, 0, 5));
    expect(fromDateParam('2026-13-01')).toBeUndefined();
    expect(fromDateParam(null)).toBeUndefined();
  });
});
