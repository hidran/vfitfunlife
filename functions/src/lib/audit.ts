import { getFirestore, FieldValue } from "firebase-admin/firestore";

export interface ServerAuditPayload {
  actorUid: string;
  actorEmail: string;
  actorRole: "admin" | "superadmin" | "provider" | "client";
  action:
    | "create"
    | "update"
    | "delete"
    | "refund"
    | "verify"
    | "suspend"
    | "activate"
    | "role_change";
  entityType:
    | "user"
    | "provider"
    | "venue"
    | "booking"
    | "payment"
    | "user_type"
    | "migration"
    | "ai_settings"
    | "ai_plan"
    | "recipe";
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
