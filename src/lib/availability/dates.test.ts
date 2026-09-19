import { describe, it, expect } from 'vitest';
import { addDaysToKey, localDateKey, romeDateKey } from './dates';

describe('availability date keys', () => {
  it('names the Italian calendar day of an instant', () => {
    expect(romeDateKey(new Date('2026-09-20T22:30:00Z'))).toBe('2026-09-21'); // 00:30 in Rome
    expect(romeDateKey(new Date('2026-09-21T21:59:00Z'))).toBe('2026-09-21'); // 23:59 in Rome
  });

  it('names the day a local-midnight picker cell stands for', () => {
    expect(localDateKey(new Date(2026, 8, 21))).toBe('2026-09-21');
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('adds days across month and year ends', () => {
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-09-19', 365)).toBe('2027-09-19');
  });
});
