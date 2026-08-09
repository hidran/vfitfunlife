import { describe, it, expect } from 'vitest';
import { DEFAULT_FLAGS, isSectionVisible, type PilotFlags } from '@/lib/firebase/remoteConfig';

const flags = (over: Partial<PilotFlags> = {}): PilotFlags => ({ ...DEFAULT_FLAGS, ...over });

describe('bundled defaults', () => {
  it('defaults to pilot mode ON', () => {
    // Remote Config fetches asynchronously, so the defaults are what paints first. Starting
    // OFF would flash VFun/VLife on every cold start — worse than not hiding them, since it
    // advertises that the sections exist.
    expect(DEFAULT_FLAGS.pilotMode).toBe(true);
    expect(DEFAULT_FLAGS.showVFun).toBe(false);
    expect(DEFAULT_FLAGS.showVLife).toBe(false);
  });

  it('defaults the pilot city to Torino', () => {
    expect(DEFAULT_FLAGS.pilotCity).toBe('Torino');
  });
});

describe('isSectionVisible', () => {
  it('always shows fit — the pilot is fitness', () => {
    expect(isSectionVisible('fit', flags())).toBe(true);
    expect(isSectionVisible('fit', flags({ pilotMode: false }))).toBe(true);
  });

  it('hides fun and life under pilot mode by default', () => {
    expect(isSectionVisible('fun', flags())).toBe(false);
    expect(isSectionVisible('life', flags())).toBe(false);
  });

  it('shows everything once pilot mode is off', () => {
    const off = flags({ pilotMode: false });
    expect(isSectionVisible('fun', off)).toBe(true);
    expect(isSectionVisible('life', off)).toBe(true);
  });

  it('lets one section return without turning the whole pilot off', () => {
    const partial = flags({ showVFun: true });
    expect(isSectionVisible('fun', partial)).toBe(true);
    expect(isSectionVisible('life', partial)).toBe(false);
  });

  it('treats a failed fetch as pilot mode, since the defaults are the safe state', () => {
    // loadPilotFlags() resolves to DEFAULT_FLAGS on any failure.
    expect(isSectionVisible('fun', DEFAULT_FLAGS)).toBe(false);
    expect(isSectionVisible('life', DEFAULT_FLAGS)).toBe(false);
  });
});
