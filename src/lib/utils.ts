import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toLocaleTag, type AppLocale } from '@/types/locale';

/**
 * Merge Tailwind classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format price with euro symbol in the given app locale (pass the active one from `useI18n()`):
 * it → "50,00 €", en → "€50.00".
 */
export function formatPrice(price: number, locale: AppLocale): string {
  return new Intl.NumberFormat(toLocaleTag(locale), {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}

/**
 * Format date in Italian locale
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('it-IT', options).format(d);
}

/**
 * Safely convert Firestore Timestamp or various date formats to JavaScript Date
 * Handles: Firestore Timestamp, Date, ISO string, milliseconds, or null/undefined
 */
export function toDate(
  value: Date | { toDate: () => Date } | string | number | null | undefined
): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return null;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format a distance in km with one decimal in the given app locale:
 * it → "0,1 km", en → "0.1 km".
 */
export function formatDistance(km: number, locale: AppLocale): string {
  return `${formatDecimal(km, locale, 1)} km`;
}

/**
 * Format a plain number with a fixed number of decimals in the given app locale:
 * it → "0,00", en → "0.00".
 */
export function formatDecimal(value: number, locale: AppLocale, decimals: number): string {
  return new Intl.NumberFormat(toLocaleTag(locale), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Where the euro sign sits around an amount in the given app locale, for input adornments:
 * it → after ("50,00 €"), en → before ("€50.00").
 */
export function euroSymbolPosition(locale: AppLocale): 'before' | 'after' {
  const parts = new Intl.NumberFormat(toLocaleTag(locale), { style: 'currency', currency: 'EUR' }).formatToParts(1);
  const currency = parts.findIndex((p) => p.type === 'currency');
  const integer = parts.findIndex((p) => p.type === 'integer');
  return currency < integer ? 'before' : 'after';
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Check if running on native platform
 */
export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const { Capacitor } = require('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Get platform name
 */
export function getPlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web';

  try {
    const { Capacitor } = require('@capacitor/core');
    return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
  } catch {
    return 'web';
  }
}
