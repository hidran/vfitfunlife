import { describe, it, expect } from 'vitest';
import { buildIcs, escapeIcsText } from './ics';

describe('buildIcs', () => {
  const now = new Date('2026-09-29T10:00:00Z');

  it('writes one VEVENT per session in UTC, CRLF-terminated', () => {
    const ics = buildIcs([
      {
        id: 'bk1',
        start: new Date('2026-10-05T08:00:00Z'),
        end: new Date('2026-10-05T09:00:00Z'),
        summary: 'Personal training – Anna',
        location: 'Parco del Valentino',
        description: 'Porta i guanti',
      },
    ], now);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('UID:bk1@vfit\r\n');
    expect(ics).toContain('DTSTAMP:20260929T100000Z\r\n');
    expect(ics).toContain('DTSTART:20261005T080000Z\r\n');
    expect(ics).toContain('DTEND:20261005T090000Z\r\n');
    expect(ics).toContain('SUMMARY:Personal training – Anna\r\n');
    expect(ics).toContain('LOCATION:Parco del Valentino\r\n');
    expect(ics).toContain('DESCRIPTION:Porta i guanti\r\n');
  });

  it('omits empty optional fields and still produces a valid empty calendar', () => {
    const ics = buildIcs([{ id: 'x', start: now, end: now, summary: 'S', location: null }], now);
    expect(ics).not.toContain('LOCATION');
    expect(ics).not.toContain('DESCRIPTION');
    expect(buildIcs([], now)).not.toContain('BEGIN:VEVENT');
  });

  it('folds long lines at 75 octets', () => {
    const ics = buildIcs([{ id: 'x', start: now, end: now, summary: 'à'.repeat(100) }], now);
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(ics.replace(/\r\n /g, '')).toContain(`SUMMARY:${'à'.repeat(100)}`);
  });
});

describe('escapeIcsText', () => {
  it('escapes the TEXT specials', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
});
