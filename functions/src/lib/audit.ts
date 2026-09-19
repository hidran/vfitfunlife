import {
  getFirestore,
  FieldValue,
  type DocumentReference,
} from "firebase-admin/firestore";
import type { AuditAction, AuditEntityType } from "./auditEntityTypes";

/**
 * `audit_logs` is the single audit collection.
 *
 * A second one, camelCase `auditLogs`, used to exist for self-service profile edits with
 * its own shape (`actor`, dotted action strings, a nested `changes` object). Two
 * collections recording the same kind of fact meant any question about "who changed what"
 * had to be asked twice, and only one of them was reachable from the typed payload below.
 * It was folded into this one; see migrateAuditLogs in functions/src/users/migrateAudit.ts.
 */
const COLLECTION = "audit_logs";

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
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string;
  // Forensic context. Only the self-service profile callables have a request to read these
  // from; they came across with the auditLogs merge rather than being dropped.
  ip?: string | null;
  userAgent?: string | null;
}

/** Maps an app role onto the audit vocabulary; `customer` and anything unknown are 'client'. */
export function toActorRole(role: unknown): ServerAuditPayload["actorRole"] {
  return role === "superadmin" || role === "admin" || role === "provider" ?
    role :
    "client";
}

/** A fresh document reference in the audit collection. */
export function auditLogDoc(): DocumentReference {
  return getFirestore().collection(COLLECTION).doc();
}

/** A document reference in the audit collection at a caller-chosen, deterministic id. */
export function auditLogDocWithId(id: string): DocumentReference {
  return getFirestore().collection(COLLECTION).doc(id);
}

/** The document body, so transactional callers can write the canonical shape themselves. */
export function auditLogData(payload: ServerAuditPayload): Record<string, unknown> {
  return { ...payload, timestamp: FieldValue.serverTimestamp() };
}

/**
 * Write an audit log entry.
 *
 * Errors are swallowed (logged only) so audit failures don't break business logic. Callers
 * that need the entry to commit atomically with the change it describes should use
 * `auditLogDoc()` / `auditLogData()` inside their transaction instead — swallowing is the
 * wrong behaviour there, and losing atomicity would be a downgrade.
 */
export async function writeAuditLog(payload: ServerAuditPayload): Promise<void> {
  try {
    await auditLogDoc().set(auditLogData(payload));
  } catch (err) {
    console.error("[audit] server-side write failed", err);
  }
}

/** gRPC status code 6: ALREADY_EXISTS. */
const ALREADY_EXISTS = 6;

function isAlreadyExists(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === ALREADY_EXISTS
  );
}

/** Whether an audit entry already exists at `id` — used to detect a resumed, mid-delete uid. */
export async function auditLogExists(id: string): Promise<boolean> {
  const snap = await getFirestore().collection(COLLECTION).doc(id).get();
  return snap.exists;
}

/**
 * Write an audit log entry exactly once, keyed by a caller-supplied deterministic id.
 *
 * Unlike `writeAuditLog`, errors are NOT swallowed: a caller that needs to know whether the
 * step this entry records actually happened (the bulk-delete job, in particular) relies on
 * either a clean resolution or a thrown error — never a silently-lost write. A second call
 * with the same id (a retried attempt) is a no-op, not a duplicate entry or an error.
 */
export async function writeAuditLogOnce(id: string, payload: ServerAuditPayload): Promise<void> {
  try {
    await getFirestore().collection(COLLECTION).doc(id).create(auditLogData(payload));
  } catch (err) {
    if (isAlreadyExists(err)) return;
    throw err;
  }
}
