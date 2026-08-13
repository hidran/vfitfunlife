import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { User } from '@/types/firebase';

// Single vocabulary, shared with functions/src/lib/auditEntityTypes.ts and pinned by
// src/types/audit.test.ts. Previously declared inline here, which is how it drifted from
// the server's list.
export type { AuditAction, AuditEntityType } from '@/types/audit';
import type { AuditAction, AuditEntityType } from '@/types/audit';

export interface AuditPayload {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
}

export async function recordAudit(actor: User | null, payload: AuditPayload): Promise<void> {
  if (!actor) {
    console.warn('[audit] skipped — no actor');
    return;
  }
  try {
    await addDoc(collection(db, 'audit_logs'), {
      actorUid: actor.id,
      actorEmail: actor.email ?? '',
      actorRole: actor.role,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId,
      before: payload.before ?? null,
      after: payload.after ?? null,
      reason: payload.reason ?? null,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.error('[audit] write failed', err);
  }
}
