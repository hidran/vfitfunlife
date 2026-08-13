import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { AuditAction, AuditEntityType } from "./auditEntityTypes";

export interface ServerAuditPayload {
  actorUid: string;
  actorEmail: string;
  actorRole: "admin" | "superadmin" | "provider" | "client";
  // Single vocabulary, shared with src/types/audit.ts and pinned by
  // src/types/audit.test.ts. Previously declared inline here, which is how it drifted
  // from the client's list.
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
}

/**
 * Write an audit log entry to the `audit_logs` collection.
 * Matches the snake_case collection name used by the client-side recordAudit.
 * Errors are swallowed (logged only) so audit failures don't break business logic.
 */
export async function writeAuditLog(payload: ServerAuditPayload): Promise<void> {
  try {
    await getFirestore()
      .collection("audit_logs")
      .add({
        ...payload,
        timestamp: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error("[audit] server-side write failed", err);
  }
}
