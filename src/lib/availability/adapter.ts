import type {
  AvailabilitySettings,
  DateOverride,
  DayOfWeek,
  TimeRange,
  WeeklySchedule,
} from '@/types/provider';

/**
 * Translates between what the server stores and what AvailabilityEditor edits.
 *
 * Stored (functions/src/availability): instructors/{uid}.availabilitySchedule — a flat array,
 * 0 = Sunday — plus bookingRules, plus one doc per date exception. Edited: the weekday map
 * and override list of AvailabilitySettings. Pure, so both directions are unit-tested.
 */

export interface WeeklyWindow {
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  isAvailable: boolean;
}

export interface BookingRules {
  bufferMinutes: number;
  minAdvanceNoticeHours: number;
  maxBookingsPerDay: number;
}

/** instructors/{uid}/availability/{date} */
export interface OverrideDoc {
  date: string; // "YYYY-MM-DD"
  isAvailable: boolean;
  windows: TimeRange[];
  reason?: string;
}

export interface StoredAvailability {
  /** null when the provider never saved hours. */
  schedule: WeeklyWindow[] | null;
  bookingRules: Partial<BookingRules> | null;
  overrides: OverrideDoc[];
}

/** updateMyAvailability's input. */
export interface AvailabilityUpdate {
  schedule: WeeklyWindow[];
  bookingRules: BookingRules;
  overrides: { upsert: OverrideDoc[]; delete: string[] };
}

export const DEFAULT_BOOKING_RULES: BookingRules = {
  bufferMinutes: 15,
  minAdvanceNoticeHours: 24,
  maxBookingsPerDay: 8,
};

const DAY_INDEX: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const DAYS = Object.keys(DAY_INDEX) as DayOfWeek[];

type Raw = Record<string, unknown>;

/** instructors/{uid}.availabilitySchedule as stored; null when the provider never saved hours. */
export function scheduleFromDoc(data: Raw | undefined): WeeklyWindow[] | null {
  const raw = data?.availabilitySchedule;
  if (!Array.isArray(raw)) return null;
  return (raw as Raw[])
    .filter((w) => typeof w?.dayOfWeek === 'number' && typeof w.startTime === 'string' && typeof w.endTime === 'string')
    .map((w) => ({
      dayOfWeek: w.dayOfWeek as number,
      startTime: w.startTime as string,
      endTime: w.endTime as string,
      isAvailable: w.isAvailable !== false,
    }));
}

/** instructors/{uid}/availability/{date}; null for a doc that is not in the current shape. */
export function overrideFromDoc(date: string, data: Raw): OverrideDoc | null {
  if (typeof data.isAvailable !== 'boolean') return null;
  const windows = Array.isArray(data.windows)
    ? (data.windows as Raw[])
        .filter((w) => typeof w?.start === 'string' && typeof w.end === 'string')
        .map((w) => ({ start: w.start as string, end: w.end as string }))
    : [];
  const doc: OverrideDoc = { date, isAvailable: data.isAvailable, windows };
  if (typeof data.reason === 'string' && data.reason) doc.reason = data.reason;
  return doc;
}

/** At least one window a client could book. An empty or all-off week is not bookable. */
export function hasBookableHours(schedule: WeeklyWindow[] | null | undefined): boolean {
  return (schedule ?? []).some((w) => w.isAvailable !== false);
}

function emptyWeek(): WeeklySchedule {
  return Object.fromEntries(DAYS.map((d) => [d, { isAvailable: false, slots: [] }])) as unknown as WeeklySchedule;
}

/**
 * Every day gets real hours by default (Mon–Fri 09:00–17:00 — approval and the migration
 * write this; see functions/src/availability/slots.ts DEFAULT_WEEKLY_HOURS), so a missing or
 * empty stored schedule here means the provider switched every day off, not "never set up".
 * The editor shows exactly that: all days off.
 */
function toWeek(schedule: WeeklyWindow[]): WeeklySchedule {
  const week = emptyWeek();
  for (const d of DAYS) {
    const windows = schedule
      .filter((w) => w.dayOfWeek === DAY_INDEX[d])
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    week[d] = {
      isAvailable: windows.some((w) => w.isAvailable !== false),
      slots: windows.map((w) => ({ start: w.startTime, end: w.endTime })),
    };
  }
  return week;
}

function toRules(raw: Partial<BookingRules> | null): BookingRules {
  return { ...DEFAULT_BOOKING_RULES, ...(raw ?? {}) };
}

/**
 * Stored → editor. The page always shows exactly what is saved: a missing or empty schedule
 * (never saved, or every day switched off) renders as all days off — there is no unsaved
 * pre-filled proposal.
 */
export function toSettings(stored: StoredAvailability): { settings: AvailabilitySettings } {
  const rules = toRules(stored.bookingRules);
  const dateOverrides: DateOverride[] = [...stored.overrides]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((o) => ({
      id: `override-${o.date}`,
      date: o.date,
      isAvailable: o.isAvailable,
      slots: o.windows,
      reason: o.reason ?? '',
    }));
  return {
    settings: {
      weeklySchedule: toWeek(stored.schedule ?? []),
      dateOverrides,
      ...rules,
      timezone: 'Europe/Rome',
    },
  };
}

function toOverrideDoc(o: DateOverride): OverrideDoc {
  const doc: OverrideDoc = { date: o.date, isAvailable: o.isAvailable, windows: o.isAvailable ? o.slots : [] };
  const reason = o.reason?.trim();
  if (reason) doc.reason = reason;
  return doc;
}

function sameOverride(a: OverrideDoc, b: OverrideDoc): boolean {
  return a.isAvailable === b.isAvailable &&
    (a.reason ?? '') === (b.reason ?? '') &&
    a.windows.length === b.windows.length &&
    a.windows.every((w, i) => w.start === b.windows[i].start && w.end === b.windows[i].end);
}

/**
 * Editor → updateMyAvailability. A switched-off day keeps its windows (isAvailable false) so
 * switching it back on restores them. Only new or changed date exceptions are sent; the ones
 * the provider removed are deleted.
 */
export function toUpdate(settings: AvailabilitySettings, loadedOverrides: OverrideDoc[]): AvailabilityUpdate {
  const schedule: WeeklyWindow[] = [];
  for (const d of DAYS) {
    const day = settings.weeklySchedule[d];
    for (const slot of day.slots) {
      schedule.push({ dayOfWeek: DAY_INDEX[d], startTime: slot.start, endTime: slot.end, isAvailable: day.isAvailable });
    }
  }

  const current = settings.dateOverrides.map(toOverrideDoc);
  const loaded = new Map(loadedOverrides.map((o) => [o.date, o]));
  const currentDates = new Set(current.map((o) => o.date));
  return {
    schedule,
    bookingRules: {
      bufferMinutes: settings.bufferMinutes,
      minAdvanceNoticeHours: settings.minAdvanceNoticeHours,
      maxBookingsPerDay: settings.maxBookingsPerDay,
    },
    overrides: {
      upsert: current.filter((o) => {
        const before = loaded.get(o.date);
        return !before || !sameOverride(before, o);
      }),
      delete: loadedOverrides.map((o) => o.date).filter((date) => !currentDates.has(date)),
    },
  };
}

/** What the store keeps as "loaded" after a successful save, so the next diff is right. */
export function savedOverrides(settings: AvailabilitySettings): OverrideDoc[] {
  return settings.dateOverrides.map(toOverrideDoc);
}
