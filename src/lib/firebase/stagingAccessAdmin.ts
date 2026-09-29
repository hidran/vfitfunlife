import { collection, getDocs, type Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, getFunctionsInstance } from './config';
import { STAGING_ALLOWLIST_COLLECTION } from '@/lib/staging/stagingGate';

/**
 * Superadmin client for the staging login allowlist (/admin/staging-access).
 *
 * Reads go straight to Firestore (rules: superadmin read). Writes go through the
 * addStagingAccess / removeStagingAccess callables — they validate + lowercase the email and
 * write the audit_logs entry server-side. Those callables are only deployed to
 * vfit-app-staging (functions/src/index.ts), so this module is useless anywhere else.
 */
export interface StagingAccessEntry {
  email: string;
  note?: string;
  addedBy?: string;
  addedAt?: Date | null;
}

export async function listStagingAccess(): Promise<StagingAccessEntry[]> {
  const snap = await getDocs(collection(db, STAGING_ALLOWLIST_COLLECTION));
  return snap.docs
    .map((d) => {
      const data = d.data() as { email?: string; note?: string; addedBy?: string; addedAt?: Timestamp };
      return {
        email: data.email ?? d.id,
        note: data.note,
        addedBy: data.addedBy,
        addedAt: data.addedAt?.toDate?.() ?? null,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function addStagingAccess(input: { email: string; note?: string }): Promise<void> {
  const fn = httpsCallable<{ email: string; note?: string }, unknown>(
    await getFunctionsInstance(),
    'addStagingAccess'
  );
  await fn(input);
}

export async function removeStagingAccess(email: string): Promise<void> {
  const fn = httpsCallable<{ email: string }, unknown>(await getFunctionsInstance(), 'removeStagingAccess');
  await fn({ email });
}
