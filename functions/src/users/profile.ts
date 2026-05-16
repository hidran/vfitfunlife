import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  NotificationSettingsSchema,
  PrivacySettingsSchema,
  SocialLinksSchema,
  type NotificationSettings,
  type PrivacySettings,
  type SocialLinks,
} from '../types';

if (admin.apps.length === 0) admin.initializeApp();

const db = () => admin.firestore();

interface UpdateNotificationSettingsData {
  settings: NotificationSettings;
}

export const updateNotificationSettings = onCall<UpdateNotificationSettingsData>(
  { region: 'europe-west1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated.');
    }
    const parsed = NotificationSettingsSchema.safeParse(request.data?.settings);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', `Invalid notification settings: ${parsed.error.message}`);
    }

    const uid = request.auth.uid;
    const userRef = db().collection('users').doc(uid);

    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'User document does not exist.');
      }
      const before = snap.data()?.notificationSettings ?? null;

      const update: Record<string, unknown> = {
        notificationSettings: parsed.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      // Migrate legacy field
      if (snap.data()?.notificationsEnabled !== undefined) {
        update.notificationsEnabled = admin.firestore.FieldValue.delete();
      }
      tx.update(userRef, update);

      const auditRef = db().collection('auditLogs').doc();
      tx.set(auditRef, {
        uid,
        actor: uid,
        action: 'profile.notifications.update',
        changes: { before, after: parsed.data },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        ip: request.rawRequest?.ip ?? null,
        userAgent: request.rawRequest?.headers?.['user-agent'] ?? null,
      });
    });

    return { success: true } as const;
  }
);

interface UpdatePrivacySettingsData { settings: PrivacySettings; }

export const updatePrivacySettings = onCall<UpdatePrivacySettingsData>(
  { region: 'europe-west1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated.');
    const parsed = PrivacySettingsSchema.safeParse(request.data?.settings);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', `Invalid privacy settings: ${parsed.error.message}`);
    }
    const uid = request.auth.uid;
    const userRef = db().collection('users').doc(uid);

    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new HttpsError('not-found', 'User document does not exist.');
      const before = snap.data()?.privacySettings ?? null;
      tx.update(userRef, {
        privacySettings: parsed.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(db().collection('auditLogs').doc(), {
        uid, actor: uid,
        action: 'profile.privacy.update',
        changes: { before, after: parsed.data },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        ip: request.rawRequest?.ip ?? null,
        userAgent: request.rawRequest?.headers?.['user-agent'] ?? null,
      });
    });
    return { success: true } as const;
  }
);

interface UpdateSocialLinksData { socialLinks: SocialLinks; }

export const updateSocialLinks = onCall<UpdateSocialLinksData>(
  { region: 'europe-west1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated.');
    const parsed = SocialLinksSchema.safeParse(request.data?.socialLinks);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', `Invalid social links: ${parsed.error.message}`);
    }
    const uid = request.auth.uid;
    const userRef = db().collection('users').doc(uid);

    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new HttpsError('not-found', 'User document does not exist.');
      const before = snap.data()?.socialLinks ?? null;
      tx.update(userRef, {
        socialLinks: parsed.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(db().collection('auditLogs').doc(), {
        uid, actor: uid,
        action: 'profile.social.update',
        changes: { before, after: parsed.data },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        ip: request.rawRequest?.ip ?? null,
        userAgent: request.rawRequest?.headers?.['user-agent'] ?? null,
      });
    });
    return { success: true } as const;
  }
);
