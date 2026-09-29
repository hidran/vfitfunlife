/**
 * "Esporta calendario" on /provider/schedule: the trainer's upcoming confirmed sessions as an
 * iCalendar (.ics) file they can open in Google / Apple / Outlook calendar.
 *
 * A one-off export, not a live sync — nothing subscribes to it, so it is built entirely in
 * the browser. The builder is pure (and unit-tested); the delivery uses a file download on
 * the web and the system share sheet inside the native app, where downloads go nowhere.
 */

import { isNativePlatform } from '@/lib/utils';

export interface IcsSession {
  id: string;
  start: Date;
  end: Date;
  summary: string;
  location?: string | null;
  description?: string | null;
}

/** 20261005T080000Z */
function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 §3.1: lines longer than 75 octets continue on the next line after a space. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  for (const ch of Array.from(line)) {
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (encoder.encode(current + ch).length > limit) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcs(sessions: IcsSession[], now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VFit//Provider schedule//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const s of sessions) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@vfit`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(s.start)}`,
      `DTEND:${icsDate(s.end)}`,
      `SUMMARY:${escapeIcsText(s.summary)}`,
    );
    if (s.location) lines.push(`LOCATION:${escapeIcsText(s.location)}`);
    if (s.description) lines.push(`DESCRIPTION:${escapeIcsText(s.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function icsFile(content: string, filename: string): File {
  return new File([content], filename, { type: 'text/calendar' });
}

/**
 * Whether this device can deliver the file at all: always on the web; in the native app only
 * where the WebView can hand a file to the share sheet (Android's WebView cannot, and a
 * download there silently goes nowhere — better not to offer the button).
 */
export function canExportIcs(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isNativePlatform()) return true;
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [icsFile('', 'probe.ics')] });
  } catch {
    return false;
  }
}

export async function deliverIcs(content: string, filename: string): Promise<void> {
  const file = icsFile(content, filename);
  if (isNativePlatform() && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Give the browser a moment to start the download before the URL goes away.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
