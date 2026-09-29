import { describe, it, expect } from 'vitest';
import { formatChatTime, participantOf, previewText } from './format';

const now = new Date(2026, 8, 29, 15, 0); // Tue 29 Sep 2026, 15:00 local

describe('formatChatTime', () => {
  it('shows the time for today', () => {
    expect(formatChatTime(new Date(2026, 8, 29, 9, 5), 'it-IT', now)).toBe('09:05');
  });

  it('shows the weekday within the last week', () => {
    expect(formatChatTime(new Date(2026, 8, 27, 9, 5), 'en-GB', now)).toBe('Sun');
  });

  it('shows the date for older messages, with the year only when different', () => {
    expect(formatChatTime(new Date(2026, 7, 1), 'en-GB', now)).toBe('1 Aug');
    expect(formatChatTime(new Date(2025, 7, 1), 'en-GB', now)).toBe('1 Aug 2025');
  });
});

describe('participantOf', () => {
  it('reads the stored name and photo', () => {
    const conv = { participants: { a: { name: ' Anna ', photoUrl: 'https://p' } } };
    expect(participantOf(conv, 'a')).toEqual({ name: 'Anna', photoUrl: 'https://p' });
  });

  it('falls back to an empty name', () => {
    expect(participantOf({ participants: {} }, 'x')).toEqual({ name: '', photoUrl: null });
    expect(participantOf(null, 'x')).toEqual({ name: '', photoUrl: null });
  });
});

describe('previewText', () => {
  it('collapses whitespace and truncates', () => {
    expect(previewText('a\n\n b')).toBe('a b');
    expect(previewText('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(previewText(null)).toBe('');
  });
});
