/**
 * Calendar-date keys ("YYYY-MM-DD") without a timezone library. The server does the real
 * Europe/Rome arithmetic (functions/src/availability/slots.ts); the client only needs to name
 * days.
 */

const ROME_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The date it is in Italy at `instant` — "today" for a provider, wherever the device is. */
export function romeDateKey(instant: Date): string {
  return ROME_DAY.format(instant);
}

/**
 * The calendar day a date picker cell stands for. Picker cells are local midnights, so this
 * reads the local fields — `toISOString()` would turn Italian midnight into the day before.
 */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
