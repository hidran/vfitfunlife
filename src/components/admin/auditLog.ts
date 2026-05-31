import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { User } from '@/types/firebase';

export type AuditAction =
  | 'create' | 'update' | 'delete'
  | 'refund' | 'verify' | 'suspend' | 'activate' | 'role_change';

export type AuditEntityType =
  | 'user' | 'provider' | 'venue' | 'booking' | 'payment' | 'user_type' | 'service_category';

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
