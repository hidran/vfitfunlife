import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  NotificationSettingsSchema,
  PrivacySettingsSchema,
  SocialLinksSchema,
  makeAvatarUrlSchema,
  type NotificationSettings,
  type PrivacySettings,
  type SocialLinks,
} from "../types";
import { auditLogDoc, auditLogData, toActorRole } from "../lib/audit";

if (admin.apps.length === 0) admin.initializeApp();

const db = () => admin.firestore();

interface UpdateNotificationSettingsData {
  settings: NotificationSettings;
}

export const updateNotificationSettings = onCall<UpdateNotificationSettingsData>(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }
    const parsed = NotificationSettingsSchema.safeParse(request.data?.settings);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", `Invalid notification settings: ${parsed.error.message}`);
    }

    const uid = request.auth.uid;
    const userRef = db().collection("users").doc(uid);

    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        throw new HttpsError("not-found", "User document does not exist.");
      }
      const before = snap.data()?.notificationSettings ?? null;

      const update: admin.firestore.UpdateData<admin.firestore.DocumentData> = {
        notificationSettings: parsed.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      // Migrate legacy field
      if (snap.data()?.notificationsEnabled !== undefined) {
        update.notificationsEnabled = admin.firestore.FieldValue.delete();
      }
      tx.update(userRef, update);

      // Written inside the transaction, so the entry and the change it describes commit
      // together or not at all. writeAuditLog would be non-transactional and swallow
      // failures, which is the wrong trade here.
      tx.set(auditLogDoc(), auditLogData({
        actorUid: uid,
        actorEmail: request.auth?.token?.email ?? "",
        actorRole: toActorRole(snap.data()?.role),
        action: "update",
        entityType: "user",
        entityId: uid,
        before: { notificationSettings: before },
        after: { notificationSettings: parsed.data },
        reason: "profile.notifications.update",
        ip: request.rawRequest?.ip ?? null,
        userAgent: request.rawRequest?.headers?.["user-agent"] ?? null,
      }));
    });

    return { success: true } as const;
  }
);

interface UpdatePrivacySettingsData { settings: PrivacySettings; }

export const updatePrivacySettings = onCall<UpdatePrivacySettingsData>(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated.");
    const parsed = PrivacySettingsSchema.safeParse(request.data?.settings);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", `Invalid privacy settings: ${parsed.error.message}`);
    }
    const uid = request.auth.uid;
    const userRef = db().collection("users").doc(uid);

    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new HttpsError("not-found", "User document does not exist.");
      const before = snap.data()?.privacySettings ?? null;
      tx.update(userRef, {
        privacySettings: parsed.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(auditLogDoc(), auditLogData({
        actorUid: uid,
        actorEmail: request.auth?.token?.email ?? "",
        actorRole: toActorRole(snap.data()?.role),
        action: "update",
        entityType: "user",
        entityId: uid,
        before: { privacySettings: before },
        after: { privacySettings: parsed.data },
        reason: "profile.privacy.update",
        ip: request.rawRequest?.ip ?? null,
        userAgent: request.rawRequest?.headers?.["user-agent"] ?? null,
      }));
    });
    return { success: true } as const;
  }
);

interface UpdateSocialLinksData { socialLinks: SocialLinks; }

export const updateSocialLinks = onCall<UpdateSocialLinksData>(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated.");
    const parsed = SocialLinksSchema.safeParse(request.data?.socialLinks);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", `Invalid social links: ${parsed.error.message}`);
    }
    const uid = request.auth.uid;
    const userRef = db().collection("users").doc(uid);

    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new HttpsError("not-found", "User document does not exist.");
      const before = snap.data()?.socialLinks ?? null;
      tx.update(userRef, {
        socialLinks: parsed.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(auditLogDoc(), auditLogData({
        actorUid: uid,
        actorEmail: request.auth?.token?.email ?? "",
        actorRole: toActorRole(snap.data()?.role),
        action: "update",
        entityType: "user",
        entityId: uid,
        before: { socialLinks: before },
        after: { socialLinks: parsed.data },
        reason: "profile.social.update",
        ip: request.rawRequest?.ip ?? null,
        userAgent: request.rawRequest?.headers?.["user-agent"] ?? null,
      }));
    });
    return { success: true } as const;
  }
);

interface UpdateAvatarData { avatarUrl: string; }

const STORAGE_BUCKET = process.env.STORAGE_BUCKET ||
  `${process.env.GCLOUD_PROJECT}.appspot.com`;

/** Extract the Storage object path from a Firebase Storage download URL. */
function extractObjectPath(url: string): string | null {
  // .../o/<URL-ENCODED-PATH>?...
  const match = url.match(/\/o\/([^?]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

export const updateAvatar = onCall<UpdateAvatarData>(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated.");
    const uid = request.auth.uid;
    const schema = makeAvatarUrlSchema(uid, STORAGE_BUCKET);
    const parsed = schema.safeParse(request.data?.avatarUrl);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", `Invalid avatar URL: ${parsed.error.message}`);
    }
    const newUrl = parsed.data;
    const userRef = db().collection("users").doc(uid);

    let previousUrl: string | null = null;
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new HttpsError("not-found", "User document does not exist.");
      previousUrl = snap.data()?.avatarUrl ?? null;
      tx.update(userRef, {
        avatarUrl: newUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(auditLogDoc(), auditLogData({
        actorUid: uid,
        actorEmail: request.auth?.token?.email ?? "",
        actorRole: toActorRole(snap.data()?.role),
        action: "update",
        entityType: "user",
        entityId: uid,
        before: { avatarUrl: previousUrl },
        after: { avatarUrl: newUrl },
        reason: "profile.avatar.update",
        ip: request.rawRequest?.ip ?? null,
        userAgent: request.rawRequest?.headers?.["user-agent"] ?? null,
      }));
    });

    // Best-effort cleanup of previous avatar
    if (previousUrl && previousUrl !== newUrl) {
      const oldPath = extractObjectPath(previousUrl);
      if (oldPath && oldPath.startsWith(`avatars/${uid}/`)) {
        try {
          await admin.storage().bucket().file(oldPath).delete();
        } catch (err) {
          console.warn(`Failed to delete previous avatar ${oldPath}:`, err);
        }
      }
    }

    return { success: true, avatarUrl: newUrl, previousUrl } as const;
  }
);
