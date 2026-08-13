import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { requireSuperAdmin } from "../utils/roles";
import { auditLogData, toActorRole, writeAuditLog } from "../lib/audit";

const region = process.env.FIREBASE_REGION || "europe-west1";
const MAX_BATCH = 450;

/**
 * Superadmin-only: fold the legacy camelCase `auditLogs` collection into `audit_logs`.
 *
 * Two collections recorded the same kind of fact in different shapes — `auditLogs` used
 * `actor` / dotted action strings / a nested `changes` object, `audit_logs` uses the typed
 * ServerAuditPayload — so "who changed what" had to be asked twice, and only one of them
 * was reachable from the shared vocabulary. The self-service profile callables now write
 * the canonical shape directly; this moves the history they already produced.
 *
 * The dotted action ("profile.avatar.update") survives as `reason`, and `ip` / `userAgent`
 * survive as first-class fields, so nothing is lost in translation.
 *
 * Idempotent: migrated documents are deleted from the source, so a second run finds
 * nothing. Roles are resolved from the users collection at migration time; a deleted user
 * degrades to 'client' rather than failing the batch.
 */
export const migrateAuditLogs = onCall({ region }, async (req) => {
  const callerUid = req.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  try {
    await requireSuperAdmin(callerUid);
  } catch {
    throw new HttpsError("permission-denied", "Superadmin required");
  }

  const db = getFirestore();
  const snap = await db.collection("auditLogs").get();

  let migrated = 0;
  let skipped = 0;
  const roleCache = new Map<string, string>();

  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    const uid = (data.actor as string) ?? (data.uid as string) ?? "";
    if (!uid) {
      skipped++;
      continue;
    }

    if (!roleCache.has(uid)) {
      const userSnap = await db.collection("users").doc(uid).get();
      roleCache.set(uid, (userSnap.data()?.role as string) ?? "client");
      // Email is not on the legacy document, so it comes from the user record too.
      roleCache.set(`${uid}:email`, (userSnap.data()?.email as string) ?? "");
    }

    const changes = (data.changes ?? {}) as { before?: unknown; after?: unknown };
    const legacyAction = (data.action as string) ?? "";
    // "profile.avatar.update" -> avatarUrl-ish key. Keep the payload under the legacy
    // action's own name rather than inventing a field mapping we cannot verify.
    const field = legacyAction.split(".")[1] || "value";

    batch.set(
      db.collection("audit_logs").doc(),
      {
        ...auditLogData({
          actorUid: uid,
          actorEmail: roleCache.get(`${uid}:email`) ?? "",
          actorRole: toActorRole(roleCache.get(uid)),
          action: "update",
          entityType: "user",
          entityId: uid,
          before: { [field]: (changes.before ?? null) as unknown } as Record<string, unknown>,
          after: { [field]: (changes.after ?? null) as unknown } as Record<string, unknown>,
          reason: legacyAction,
          ip: (data.ip as string) ?? null,
          userAgent: (data.userAgent as string) ?? null,
        }),
        // The original timestamp, not migration time — an audit trail that renumbers its
        // own history is worth less than one that admits it was moved.
        timestamp: data.timestamp ?? null,
        migratedFrom: "auditLogs",
      },
    );
    ops++;
    batch.delete(docSnap.ref);
    ops++;
    migrated++;

    if (ops >= MAX_BATCH) await flush();
  }
  await flush();

  const report = { scanned: snap.size, migrated, skipped };

  await writeAuditLog({
    actorUid: callerUid,
    actorEmail: req.auth?.token?.email ?? "",
    actorRole: "superadmin",
    action: "update",
    entityType: "migration",
    entityId: "audit_logs_consolidation",
    after: report,
    reason: "Fold legacy auditLogs collection into audit_logs",
  });

  return report;
});
