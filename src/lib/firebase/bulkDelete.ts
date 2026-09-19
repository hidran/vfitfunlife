import { httpsCallable } from 'firebase/functions';
import { collection, doc, limit, onSnapshot, orderBy, query, where, getDocs } from 'firebase/firestore';
import { db, functions } from './config';

export type JobStatus = 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'failed';
type Outcome = { status: 'deleted' | 'skipped' | 'failed'; reason?: string; error?: string };

export interface BulkDeleteJobView {
  id: string;
  status: JobStatus;
  total: number;
  deleted: number;
  skipped: number;
  failed: number;
  /** Only set when status is the terminal 'failed' — the job's own stop reason. */
  error?: string;
}

export async function startBulkDelete(uids: string[], reason: string): Promise<string> {
  const fn = httpsCallable<{ uids: string[]; reason: string }, { jobId: string }>(functions, 'adminBulkDeleteUsers');
  return (await fn({ uids, reason })).data.jobId;
}

/** Counts come from `results` so progress moves per user, not only when the job ends. */
export function toJobView(id: string, data: Record<string, unknown>): BulkDeleteJobView {
  const results = Object.values((data.results ?? {}) as Record<string, Outcome>);
  const count = (s: Outcome['status']) => results.filter((r) => r.status === s).length;
  return {
    id,
    status: data.status as JobStatus,
    total: (data.total as number) ?? 0,
    deleted: count('deleted'),
    skipped: count('skipped'),
    failed: count('failed'),
    error: data.error as string | undefined,
  };
}

/**
 * `onError` fires when the listener itself fails (permissions, offline) — the job keeps
 * running server-side regardless, so the caller should surface it without treating the job
 * as stopped.
 */
export function watchBulkDeleteJob(
  jobId: string,
  onChange: (job: BulkDeleteJobView) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, 'adminJobs', jobId),
    (snap) => {
      if (snap.exists()) onChange(toJobView(snap.id, snap.data()));
    },
    onError,
  );
}

/** The caller's most recent unfinished job, so a reload mid-job brings the banner back. */
export async function findRunningBulkDelete(actorUid: string): Promise<string | null> {
  const snap = await getDocs(
    query(
      collection(db, 'adminJobs'),
      where('actorUid', '==', actorUid),
      where('status', 'in', ['queued', 'running']),
      orderBy('createdAt', 'desc'),
      limit(1),
    ),
  );
  return snap.empty ? null : snap.docs[0].id;
}
