import type { LogFilters } from '@/types/admin';
import {
  fromDateParam,
  pageFromParams,
  pageSizeFromParams,
  toDateParam,
} from './usersListQuery';

/**
 * Every `action` the admin action log (`systemLogs`, written by logAdminAction in
 * lib/firebase/admin) records. logAdminAction only accepts these, so the action filter
 * always offers exactly what can be found.
 */
export const SYSTEM_LOG_ACTIONS = [
  'ACTIVATE_USER',
  'BULK_UPDATE_USERS',
  'BULK_UPDATE_USER_ROLE',
  'CANCEL_BOOKING',
  'CREATE_ANNOUNCEMENT',
  'CREATE_SERVICE_CATEGORY',
  'CREATE_USER_TYPE',
  'DELETE_SERVICE_CATEGORY',
  'DELETE_USER_TYPE',
  'PROCESS_PAYOUT',
  'PROCESS_REFUND',
  'REJECT_PROVIDER',
  'SUSPEND_USER',
  'UPDATE_SERVICE_CATEGORY',
  'UPDATE_SETTINGS',
  'UPDATE_USER_ROLE',
  'UPDATE_USER_TYPE',
  'VERIFY_PROVIDER',
] as const;
export type SystemLogAction = (typeof SYSTEM_LOG_ACTIONS)[number];

/** The logs list keeps its historical, longer default page. */
export const DEFAULT_LOGS_PAGE_SIZE = 50;

export const DEFAULT_LOG_FILTERS: LogFilters = {
  severity: 'all',
  action: 'all',
  search: '',
  page: 1,
  limit: DEFAULT_LOGS_PAGE_SIZE,
};

const SEVERITIES = ['all', 'info', 'warning', 'error'] as const;

/**
 * The /admin/logs filters live in the URL (same contract as usersListQuery). Unknown values
 * fall back to the defaults rather than reaching the Firestore query.
 */
export function logFiltersFromParams(params: URLSearchParams): LogFilters {
  const severity = params.get('severity');
  const action = params.get('action');
  const filters: LogFilters = {
    ...DEFAULT_LOG_FILTERS,
    search: params.get('q') ?? '',
    severity: (SEVERITIES as readonly string[]).includes(severity ?? '')
      ? (severity as LogFilters['severity'])
      : 'all',
    action: (SYSTEM_LOG_ACTIONS as readonly string[]).includes(action ?? '') ? action! : 'all',
    page: pageFromParams(params),
    limit: pageSizeFromParams(params, DEFAULT_LOGS_PAGE_SIZE),
  };
  const dateFrom = fromDateParam(params.get('from'));
  const dateTo = fromDateParam(params.get('to'), true);
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;
  return filters;
}

/** The inverse of logFiltersFromParams; defaults are omitted to keep the URL clean. */
export function queryFromLogFilters(filters: LogFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.severity && filters.severity !== 'all') params.set('severity', filters.severity);
  if (filters.action && filters.action !== 'all') params.set('action', filters.action);
  if (filters.dateFrom) params.set('from', toDateParam(filters.dateFrom));
  if (filters.dateTo) params.set('to', toDateParam(filters.dateTo));
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (filters.limit && filters.limit !== DEFAULT_LOGS_PAGE_SIZE) params.set('size', String(filters.limit));
  return params.toString();
}
