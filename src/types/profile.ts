import { z } from 'zod';

// ============================================
// Social Links
// ============================================

const instagramRegex = /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._-]+\/?$/i;
const facebookRegex  = /^https?:\/\/(www\.)?facebook\.com\/[A-Za-z0-9.-]+\/?$/i;
const twitterRegex   = /^https?:\/\/(www\.)?(twitter|x)\.com\/[A-Za-z0-9_]+\/?$/i;
const linkedinRegex  = /^https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9_-]+\/?$/i;
const tiktokRegex    = /^https?:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._-]+\/?$/i;
const websiteRegex   = /^https?:\/\/[^\s]+\.[^\s]+$/i;

const optionalUrl = (regex: RegExp, platform: string) =>
  z.string().refine(
    (v) => v === '' || regex.test(v),
    { message: `Invalid ${platform} URL` }
  ).optional();

export const SocialLinksSchema = z.object({
  instagram: optionalUrl(instagramRegex, 'Instagram'),
  facebook:  optionalUrl(facebookRegex, 'Facebook'),
  twitter:   optionalUrl(twitterRegex, 'Twitter/X'),
  linkedin:  optionalUrl(linkedinRegex, 'LinkedIn'),
  tiktok:    optionalUrl(tiktokRegex, 'TikTok'),
  website:   optionalUrl(websiteRegex, 'website'),
}).strict();

export type SocialLinks = z.infer<typeof SocialLinksSchema>;

// ============================================
// Notification Settings
// ============================================

export const NotificationSettingsSchema = z.object({
  push: z.object({
    booking: z.boolean(),
    promotion: z.boolean(),
    system: z.boolean(),
    chat: z.boolean(),
  }).strict(),
  email: z.object({
    booking: z.boolean(),
    promotion: z.boolean(),
    system: z.boolean(),
    chat: z.boolean(),
    weeklyDigest: z.boolean(),
  }).strict(),
  sms: z.object({
    booking: z.boolean(),
    reminder: z.boolean(),
  }).strict(),
}).strict();

export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

export const defaultNotificationSettings: NotificationSettings = {
  push:  { booking: true,  promotion: false, system: true,  chat: true },
  email: { booking: true,  promotion: false, system: true,  chat: false, weeklyDigest: false },
  sms:   { booking: true,  reminder: true },
};

export const allFalseNotificationSettings: NotificationSettings = {
  push:  { booking: false, promotion: false, system: false, chat: false },
  email: { booking: false, promotion: false, system: false, chat: false, weeklyDigest: false },
  sms:   { booking: false, reminder: false },
};

// ============================================
// Privacy Settings
// ============================================

export const ProfileVisibilitySchema = z.enum(['public', 'verified_only', 'private']);
export type ProfileVisibility = z.infer<typeof ProfileVisibilitySchema>;

export const PrivacySettingsSchema = z.object({
  profileVisibility: ProfileVisibilitySchema,
  showEmail: z.boolean(),
  showPhone: z.boolean(),
  allowDirectMessages: z.boolean(),
  shareAnalytics: z.boolean(),
}).strict();

export type PrivacySettings = z.infer<typeof PrivacySettingsSchema>;

export const defaultPrivacySettings: PrivacySettings = {
  profileVisibility: 'public',
  showEmail: false,
  showPhone: false,
  allowDirectMessages: true,
  shareAnalytics: true,
};

// ============================================
// Avatar URL validator (factory — needs caller uid + bucket name)
// ============================================

/** Returns a Zod schema that validates an avatar URL against caller's uid and our bucket. */
export const makeAvatarUrlSchema = (uid: string, bucket: string) => {
  const escapedBucket = bucket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `^https://firebasestorage\\.googleapis\\.com/v0/b/${escapedBucket}/o/avatars%2F${uid}%2F[^?]+(\\?.*)?$`
  );
  return z.string().regex(re, 'Avatar URL must be a Firebase Storage URL under avatars/{uid}/');
};
