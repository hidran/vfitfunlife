export interface AvailabilitySlot {
  dayOfWeek: number; // 0=Sun..6=Sat
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  isAvailable?: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function slotCovers(slot: { startTime: string; endTime: string }, start: string, end: string): boolean {
  return hhmmToMinutes(slot.startTime) <= hhmmToMinutes(start) &&
         hhmmToMinutes(slot.endTime) >= hhmmToMinutes(end);
}

export function matchesAvailability(
  schedule: AvailabilitySlot[] | undefined,
  dayOfWeek: number,
  startTime?: string,
  endTime?: string,
): boolean {
  if (!schedule || schedule.length === 0) return false;
  const daySlots = schedule.filter((s) => s.dayOfWeek === dayOfWeek && s.isAvailable !== false);
  if (daySlots.length === 0) return false;
  // Require both-or-neither: a half-specified window (exactly one of
  // startTime/endTime) is ambiguous and must NOT silently pass the time gate.
  if (!startTime && !endTime) return true;
  if (!startTime || !endTime) return false;
  return daySlots.some((s) => slotCovers(s, startTime, endTime));
}

export function formatSlotLabel(dayOfWeek: number, startTime: string, endTime: string): string {
  return `${DAY_LABELS[dayOfWeek]} ${startTime}–${endTime}`;
}
