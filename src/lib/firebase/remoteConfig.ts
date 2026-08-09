'use client';

/**
 * Firebase Remote Config — pilot feature flags.
 *
 * Chosen over the Firestore settings document because these flags must apply to
 * signed-out visitors: the tab bar renders before login. Remote Config needs no auth and
 * is SDK-cached; a Firestore flag would need a publicly readable document and a read on
 * every cold start.
 *
 * Client-only. Under `output: 'export'` this must never initialise at module scope, or the
 * server render pass fails.
 *
 * Spec: docs/superpowers/specs/2026-08-09-pilot-feature-flags-design.md
 */

import { getApp } from 'firebase/app';
import {
  fetchAndActivate,
  getRemoteConfig,
  getValue,
  type RemoteConfig,
} from 'firebase/remote-config';

export interface PilotFlags {
  pilotMode: boolean;
  showVFun: boolean;
  showVLife: boolean;
  pilotCity: string;
}

/**
 * Bundled defaults. `pilot_mode` is TRUE here on purpose.
 *
 * Remote Config fetches asynchronously, so whatever is in these defaults is what paints
 * first. Defaulting to pilot mode means the first frame is already correct for the pilot,
 * and a slow, blocked or failed fetch degrades INTO the safe state rather than out of it.
 * Defaulting to false would flash VFun/VLife on every cold start — worse than not hiding
 * them, because it advertises that the sections exist.
 */
export const DEFAULT_FLAGS: PilotFlags = {
  pilotMode: true,
  showVFun: false,
  showVLife: false,
  pilotCity: 'Torino',
};

const REMOTE_DEFAULTS = {
  pilot_mode: DEFAULT_FLAGS.pilotMode,
  show_vfun: DEFAULT_FLAGS.showVFun,
  show_vlife: DEFAULT_FLAGS.showVLife,
  pilot_city: DEFAULT_FLAGS.pilotCity,
};

let instance: RemoteConfig | null = null;

function getInstance(): RemoteConfig | null {
  if (typeof window === 'undefined') return null;
  if (instance) return instance;
  try {
    const rc = getRemoteConfig(getApp());
    rc.defaultConfig = REMOTE_DEFAULTS;
    // Long enough not to hammer the service, short enough that flipping a flag in the
    // console takes effect within the hour without shipping a release. Zero in dev so a
    // change is testable immediately.
    rc.settings.minimumFetchIntervalMillis =
      process.env.NODE_ENV === 'production' ? 60 * 60 * 1000 : 0;
    instance = rc;
    return rc;
  } catch {
    // Remote Config is unavailable in some webviews and blocked by some extensions.
    // Callers fall back to DEFAULT_FLAGS, which is pilot mode.
    return null;
  }
}

function readFlags(rc: RemoteConfig): PilotFlags {
  return {
    pilotMode: getValue(rc, 'pilot_mode').asBoolean(),
    showVFun: getValue(rc, 'show_vfun').asBoolean(),
    showVLife: getValue(rc, 'show_vlife').asBoolean(),
    pilotCity: getValue(rc, 'pilot_city').asString() || DEFAULT_FLAGS.pilotCity,
  };
}

/**
 * Fetches and activates, then returns the resolved flags.
 * Never throws — any failure yields the defaults, which are the safe state.
 */
export async function loadPilotFlags(): Promise<PilotFlags> {
  const rc = getInstance();
  if (!rc) return DEFAULT_FLAGS;
  try {
    await fetchAndActivate(rc);
    return readFlags(rc);
  } catch {
    // Offline, blocked, or fetch throttled — the activated (or default) values still read.
    try {
      return readFlags(rc);
    } catch {
      return DEFAULT_FLAGS;
    }
  }
}

/**
 * Resolves whether a section should be visible.
 *
 * `show_vfun` / `show_vlife` are independent of `pilot_mode` so a single section can be
 * brought back without turning the whole pilot off.
 */
export function isSectionVisible(section: 'fit' | 'fun' | 'life', flags: PilotFlags): boolean {
  if (section === 'fit') return true;
  if (!flags.pilotMode) return true;
  return section === 'fun' ? flags.showVFun : flags.showVLife;
}
