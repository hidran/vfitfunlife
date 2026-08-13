import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

/**
 * Superadmin client for the pilot flags. Reads go through the callable, NOT through
 * src/lib/firebase/remoteConfig.ts: that module returns the throttled values the client
 * SDK last fetched, so the panel would keep showing the old value after a publish.
 *
 * Spec: docs/superpowers/specs/2026-08-13-pilot-flags-admin-design.md §6
 */
export interface PilotFlagValues {
  pilot_mode: boolean;
  show_vfun: boolean;
  show_vlife: boolean;
  pilot_city: string;
}

export interface PilotFlagsResult {
  flags: PilotFlagValues;
  versionNumber: string | null;
  updateTime: string | null;
  updateUserEmail: string | null;
}

export async function getPilotFlagsAdmin(): Promise<PilotFlagsResult> {
  const fn = httpsCallable<void, PilotFlagsResult>(functions, 'getPilotFlagsAdmin');
  const res = await fn();
  return res.data;
}

export async function setPilotFlags(
  updates: Partial<PilotFlagValues>
): Promise<PilotFlagsResult> {
  const fn = httpsCallable<Partial<PilotFlagValues>, PilotFlagsResult>(
    functions,
    'setPilotFlags'
  );
  const res = await fn(updates);
  return res.data;
}
