import { httpsCallable } from "firebase/functions";
import { getFunctionsInstance } from "./app";
import type { AppLocale } from "@/types/locale";
import type { PaymentSettings } from "@/hooks/usePaymentSettings";
import type {
  AiStreamChunk,
  AiAssistantSettings,
  AiProviderId,
  ResultCard,
} from "@/types/assistant";
import type {
  BookingStatus,
  BusinessLegalForm,
  PaymentConfirmationMethod,
  ProviderType,
} from "@/types/firebase";

// Type definitions for function responses
interface BookingResult {
  bookingId: string;
  finalPrice: number;
  depositAmount: number;
  pointsUsed: number;
  pointsEarned: number;
}

interface CancelBookingResult {
  success: boolean;
  refundAmount: number;
}

interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

interface SubscriptionResult {
  subscriptionId: string;
  clientSecret: string;
}

interface ReferralResult {
  success: boolean;
  pointsEarned: number;
}

interface UserStatsResult {
  completedBookings: number;
  totalPointsEarned: number;
  reviewsWritten: number;
  activeChallenges: number;
  referralCount: number;
}

interface ReviewResult {
  reviewId: string;
  pointsEarned: number;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  value: number;
  isVip: boolean;
}

interface LeaderboardResult {
  leaderboard: LeaderboardEntry[];
}

// Booking functions
//
// These wrappers are the ONLY write path for bookings. Every status transition runs
// server-side with Admin SDK privileges, which is what lets firestore.rules deny client
// and trainer writes to `status` and `paymentConfirmation` outright.
export async function createBooking(data: {
  /** Omit for trainer sessions (home / online / outdoor) — they have no venue. */
  venueId?: string;
  serviceId: string;
  instructorId?: string;
  scheduledAt: string;
  bookingType: "in_venue" | "home_service" | "virtual" | "outdoor";
  serviceAddress?: {
    street: string;
    city: string;
    postalCode: string;
    latitude: number;
    longitude: number;
  };
  promotionCode?: string;
  usePoints?: boolean;
  userNotes?: string;
}): Promise<BookingResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, BookingResult>(functions, "createBooking");
  const result = await fn(data);
  return result.data;
}

export async function cancelBooking(data: {
  bookingId: string;
  reason?: string;
}): Promise<CancelBookingResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, CancelBookingResult>(functions, "cancelBooking");
  const result = await fn(data);
  return result.data;
}

export async function confirmBooking(data: {
  bookingId: string;
}): Promise<{ success: boolean }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, { success: boolean }>(functions, "confirmBooking");
  const result = await fn(data);
  return result.data;
}

// --- Trainer transition callables (P0-1) ---

export interface TransitionResult {
  success: boolean;
  bookingId: string;
  status: BookingStatus;
}

async function callTransition<T extends { bookingId: string }>(
  name: string,
  data: T
): Promise<TransitionResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<T, TransitionResult>(functions, name);
  const result = await fn(data);
  return result.data;
}

/** Trainer accepts a requested session. */
export function acceptBooking(data: { bookingId: string; note?: string }) {
  return callTransition("acceptBooking", data);
}

/** Trainer declines a requested session. */
export function declineBooking(data: { bookingId: string; note?: string }) {
  return callTransition("declineBooking", data);
}

/** Trainer cancels a session they had already accepted. */
export function cancelBookingAsTrainer(data: { bookingId: string; reason?: string }) {
  return callTransition("cancelBookingAsTrainer", { bookingId: data.bookingId, note: data.reason });
}

/**
 * Trainer marks the session done. `noShow: true` records a no-show instead — which
 * deliberately awards no loyalty points and does not stamp completedAt.
 */
export function completeBooking(data: { bookingId: string; noShow?: boolean }) {
  return callTransition("completeBooking", data);
}

/**
 * Trainer adds a session for one of their own clients ("Aggiungi appuntamento"). The server
 * re-checks the slot, prices it from the service and creates it already `accepted`.
 */
export async function createBookingAsTrainer(data: {
  clientUserId: string;
  serviceId: string;
  /** A getProviderSlots slot's own ISO instant. */
  startsAt: string;
  note?: string;
}): Promise<{ bookingId: string; finalPrice: number }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, { bookingId: string; finalPrice: number }>(
    functions,
    "createBookingAsTrainer"
  );
  return (await fn(data)).data;
}

export interface AddedRosterClient {
  id: string;
  userId: string;
  name: string;
  email: string;
}

export type AddClientByEmailResult =
  | { status: 'added'; alreadyClient: boolean; client: AddedRosterClient }
  | { status: 'not_found' };

/**
 * Trainer adds a client by email ("Nuovo cliente"). An existing account joins the trainer's
 * roster (`added`); an unknown address answers `not_found` and nothing is sent — inviting is
 * a separate, explicit step (inviteClientToPlatform). Errors carry the server's code in
 * `message`: invalid_email, self, rate_limited, instructor_not_bookable.
 */
export async function addClientByEmail(email: string): Promise<AddClientByEmailResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<{ email: string }, AddClientByEmailResult>(functions, 'addClientByEmail');
  return (await fn({ email })).data;
}

/**
 * Trainer chose "Invita a unirsi a VFit" for an address with no account: sends the localized
 * invitation email. Shares addClientByEmail's rate limit; extra error codes:
 * already_registered, email_failed.
 */
export async function inviteClientToPlatform(email: string): Promise<{ status: 'invited' }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<{ email: string }, { status: 'invited' }>(functions, 'inviteClientToPlatform');
  return (await fn({ email })).data;
}

export type CreateClientAccountResult =
  | { status: 'created'; emailSent: boolean; client: AddedRosterClient }
  /** The address registered meanwhile: it was simply added to the roster. */
  | { status: 'added'; alreadyExisted: true; alreadyClient: boolean; client: AddedRosterClient };

/**
 * Trainer creates the account of a client who has none (after `not_found`): the client joins
 * the roster at once and gets an email to confirm the account by choosing a password.
 * `emailSent: false` → the account exists but the email did not go out (resend from the
 * client's page). Shares addClientByEmail's rate limit; extra error codes: invalid_name,
 * invalid_phone, account_create_failed.
 */
export async function createClientAccount(data: {
  email: string;
  fullName: string;
  phone?: string;
}): Promise<CreateClientAccountResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, CreateClientAccountResult>(functions, 'createClientAccount');
  return (await fn(data)).data;
}

/**
 * Re-sends the confirmation email of an account this trainer created that is still waiting
 * for confirmation. `already_active` → the client has signed in meanwhile (badge is stale).
 * Errors: not_your_client, email_failed, rate_limited.
 */
export async function resendClientAccountEmail(
  userId: string,
): Promise<{ status: 'sent' | 'already_active' }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<{ userId: string }, { status: 'sent' | 'already_active' }>(
    functions,
    'resendClientAccountEmail',
  );
  return (await fn({ userId })).data;
}

/** Trainer saves their private notes on one of their bookings (server-only field). */
export async function updateBookingPrivateNotes(bookingId: string, notes: string) {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<{ bookingId: string; notes: string }, { internalNotes: string | null }>(
    functions,
    'updateBookingPrivateNotes'
  );
  return (await fn({ bookingId, notes })).data;
}

/** Trainer records a payment received off-platform. Amount is revalidated server-side. */
export function confirmBookingPayment(data: {
  bookingId: string;
  method: PaymentConfirmationMethod;
  amount: number;
}) {
  return callTransition("confirmBookingPayment", data);
}

export interface RespondToPaymentResult {
  success: boolean;
  bookingId: string;
  response: string;
  /** XP the client just earned for confirming the service (0 on a dispute or a repeat). */
  xpAwarded?: number;
}

/**
 * Client's "service received" confirmation (earns XP, once) or dispute. Silence
 * auto-confirms after 48h without XP; the client can still confirm afterwards.
 */
export async function respondToPaymentConfirmation(data: {
  bookingId: string;
  response: "confirmed" | "disputed";
  disputeReason?: string;
}): Promise<RespondToPaymentResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, RespondToPaymentResult>(
    functions,
    "respondToPaymentConfirmation"
  );
  const result = await fn(data);
  return result.data;
}

/** Superadmin-only status backfill. Defaults to a dry run. */
export async function migrateBookingStatuses(data: { dryRun?: boolean } = {}): Promise<{
  dryRun: boolean;
  scanned: number;
  migrated: number;
  skipped: number;
  instructorIdBackfilled: number;
  counts: Record<string, number>;
}> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, {
    dryRun: boolean; scanned: number; migrated: number;
    skipped: number; instructorIdBackfilled: number; counts: Record<string, number>;
  }>(functions, "migrateBookingStatuses");
  const result = await fn(data);
  return result.data;
}

// Payment functions
export async function createStripeCustomer(): Promise<{ customerId: string }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<void, { customerId: string }>(functions, "createStripeCustomer");
  const result = await fn();
  return result.data;
}

export async function createPaymentIntent(data: {
  bookingId: string;
  isDeposit?: boolean;
}): Promise<PaymentIntentResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, PaymentIntentResult>(functions, "createPaymentIntent");
  const result = await fn(data);
  return result.data;
}

export async function createVipSubscription(data: {
  planId: string;
}): Promise<SubscriptionResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, SubscriptionResult>(functions, "createVipSubscription");
  const result = await fn(data);
  return result.data;
}

export async function addWalletFunds(data: {
  amount: number;
}): Promise<{ clientSecret: string }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, { clientSecret: string }>(functions, "addWalletFunds");
  const result = await fn(data);
  return result.data;
}

// User functions
export async function seedDefaultSeason0Progress(): Promise<{ seeded: boolean; xp: number; level: number; xpToNextLevel: number; dayStreak: number }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<void, { seeded: boolean; xp: number; level: number; xpToNextLevel: number; dayStreak: number }>(functions, 'seedDefaultSeason0Progress');
  const result = await fn();
  return result.data;
}

export async function applyReferralCode(data: {
  referralCode: string;
}): Promise<ReferralResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, ReferralResult>(functions, "applyReferralCode");
  const result = await fn(data);
  return result.data;
}

export async function updateProfile(data: {
  fullName?: string;
  dateOfBirth?: Date;
  preferredLanguage?: AppLocale;
  preferredSection?: "fit" | "fun" | "life";
  notificationsEnabled?: boolean;
}): Promise<{ success: boolean }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, { success: boolean }>(functions, "updateProfile");
  const result = await fn(data);
  return result.data;
}

export async function getUserStats(): Promise<UserStatsResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<void, UserStatsResult>(functions, "getUserStats");
  const result = await fn();
  return result.data;
}

export async function saveAddress(data: {
  addressId?: string;
  address: {
    label: string;
    street: string;
    streetNumber: string;
    city: string;
    postalCode: string;
    province: string;
    country?: string;
    latitude: number;
    longitude: number;
    geohash: string;
    isDefault?: boolean;
  };
}): Promise<{ addressId: string }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, { addressId: string }>(functions, "saveAddress");
  const result = await fn(data);
  return result.data;
}

export async function deleteAddress(data: {
  addressId: string;
}): Promise<{ success: boolean }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, { success: boolean }>(functions, "deleteAddress");
  const result = await fn(data);
  return result.data;
}

export async function getLeaderboard(data: {
  type?: "points" | "bookings";
  limit?: number;
}): Promise<LeaderboardResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, LeaderboardResult>(functions, "getLeaderboard");
  const result = await fn(data);
  return result.data;
}

/**
 * Publish the review of a delivered booking. The server allows one per booking and rejects
 * with `functions/already-exists` on a second one — see src/lib/reviews/errors.ts.
 */
export async function submitReview(data: {
  bookingId: string;
  /** Integer 1–5. */
  rating: number;
  comment?: string;
  /** Quick-tag keys (REVIEW_TAG_KEYS); unknown keys are dropped server-side. */
  tags?: string[];
}): Promise<ReviewResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, ReviewResult>(functions, "submitReview");
  const result = await fn(data);
  return result.data;
}

// Gamification — Season 0
// ────────────────────────────────────────────────────────────────────────

export interface CheckInResult {
  checkedIn: boolean;
  reason?: string;
  dayStreak: number;
  xpAwarded?: number;
  pointsAwarded?: number;
  isMilestone?: boolean;
  xp: number;
  level: number;
  xpToNextLevel: number;
  lastCheckInAt: string;
}

export async function checkIn(): Promise<CheckInResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<void, CheckInResult>(functions, "checkIn");
  const result = await fn();
  return result.data;
}

export interface Season0ClaimResult {
  claimed: boolean;
  xp: number;
  points: number;
  pointsBalance: number;
}

export async function claimProfileCompleteReward(): Promise<Season0ClaimResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<void, Season0ClaimResult>(functions, "claimProfileCompleteReward");
  const result = await fn();
  return result.data;
}

export async function claimInterestsReward(data: { interestsCount?: number }): Promise<Season0ClaimResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, Season0ClaimResult>(functions, "claimInterestsReward");
  const result = await fn(data);
  return result.data;
}

export async function claimZoneReward(): Promise<Season0ClaimResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<void, Season0ClaimResult>(functions, "claimZoneReward");
  const result = await fn();
  return result.data;
}

export async function claimFamilyReward(): Promise<Season0ClaimResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<void, Season0ClaimResult>(functions, "claimFamilyReward");
  const result = await fn();
  return result.data;
}

export interface FamilyResult {
  familyId: string;
  inviteCode: string | null;
  name: string;
  memberCount: number;
  role: "creator" | "member";
  xpAwarded?: number;
  pointsAwarded?: number;
  xp?: number;
  level?: number;
  xpToNextLevel?: number;
}

export interface FamilyLeaveResult {
  success: boolean;
  familyId: string;
  memberCount: number;
}

export interface FamilyQueryResult {
  family: {
    id: string;
    name: string;
    inviteCode: string | null;
    memberCount: number;
    createdBy: string;
    creatorName: string;
    creatorAvatar: string | null;
    createdAt: string | null;
    settings: {
      allowTransfers: boolean;
      maxMembers: number;
    } | null;
  } | null;
}

export async function createFamily(data: { name: string }): Promise<FamilyResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, FamilyResult>(functions, "createFamily");
  const result = await fn(data);
  return result.data;
}

export async function joinFamily(data: { inviteCode?: string; familyId?: string }): Promise<FamilyResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, FamilyResult>(functions, "joinFamily");
  const result = await fn(data);
  return result.data;
}

export async function leaveFamily(): Promise<FamilyLeaveResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<void, FamilyLeaveResult>(functions, "leaveFamily");
  const result = await fn();
  return result.data;
}

export async function getMyFamily(): Promise<FamilyQueryResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<void, FamilyQueryResult>(functions, "getMyFamily");
  const result = await fn();
  return result.data;
}

// Notification functions
export async function registerFcmToken(data: {
  token: string;
  platform: "ios" | "android" | "web";
}): Promise<{ success: boolean }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, { success: boolean }>(functions, "registerFcmToken");
  const result = await fn(data);
  return result.data;
}

export async function markNotificationRead(data: {
  notificationId: string;
}): Promise<{ success: boolean }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, { success: boolean }>(functions, "markNotificationRead");
  const result = await fn(data);
  return result.data;
}

export async function markAllNotificationsRead(): Promise<{ markedCount: number }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<void, { markedCount: number }>(functions, "markAllNotificationsRead");
  const result = await fn();
  return result.data;
}

// AI assistant functions
type AssistantStreamFinal = {
  chatId: string;
  messageId: string;
  text: string;
  cards: ResultCard[];
};

/** Stream a chat turn. Yields chunks; resolves final on the returned promise. */
export async function streamAssistant(input: { chatId?: string; message: string; locale: string }) {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof input, AssistantStreamFinal>(functions, "chatWithAssistant");
  return fn.stream(input) as Promise<{
    stream: AsyncIterable<AiStreamChunk>;
    data: Promise<AssistantStreamFinal>;
  }>;
}

export async function getAiSettingsAdmin(): Promise<{
  settings: AiAssistantSettings;
  keyPresence: Record<AiProviderId, boolean>;
}> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<
    void,
    { settings: AiAssistantSettings; keyPresence: Record<AiProviderId, boolean> }
  >(functions, "getAiSettingsAdmin");
  return (await fn()).data;
}

export async function updateAiSettings(patch: Partial<AiAssistantSettings>): Promise<void> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<Partial<AiAssistantSettings>, { success: boolean }>(
    functions,
    "updateAiSettings",
  );
  await fn(patch);
}

export async function testAiConnection(input: {
  provider?: AiProviderId;
  model?: string;
}): Promise<{ ok: boolean; sample?: string; error?: string }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof input, { ok: boolean; sample?: string; error?: string }>(
    functions,
    "testAiConnection",
  );
  return (await fn(input)).data;
}

export async function migrateInstructorCatalog(): Promise<{ scanned: number; updated: number; skippedCity?: number; skippedActivity?: number }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<void, { scanned: number; updated: number; skippedCity?: number; skippedActivity?: number }>(functions, "migrateInstructorCatalog");
  return (await fn()).data;
}

// AI Authoring settings (superadmin)
export interface AiAuthoringSettings {
  enabled: boolean;
  provider: AiProviderId;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  dailyQuota: number;
  recipeClientDailyQuota: number;
  systemPromptOverride?: string;
}

export async function getAiAuthoringSettingsAdmin(): Promise<{
  settings: AiAuthoringSettings;
  keyPresence: Record<AiProviderId, boolean>;
}> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<
    void,
    { settings: AiAuthoringSettings; keyPresence: Record<AiProviderId, boolean> }
  >(functions, "getAiAuthoringSettingsAdmin");
  return (await fn()).data;
}

export async function updateAiAuthoringSettings(patch: Partial<AiAuthoringSettings>): Promise<void> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<Partial<AiAuthoringSettings>, { success: boolean }>(
    functions,
    "updateAiAuthoringSettings",
  );
  await fn(patch);
}

// --- Provider applications ---

/**
 * A user opts in as a professional (functions/src/providers/applyAsProvider.ts). What happens
 * next depends on the back office's `systemSettings/providerOnboarding.autoApprove`:
 *
 * - ON (the default), for an individual: approved on the spot — role 'provider', default
 *   Mon-Fri hours and a draft service per chosen category, in one server-side write
 *   (`autoApproved: true`).
 * - OFF, or for a company (`providerType: 'business'`, which is never auto-approved): stored as
 *   a pending application for an admin to decide in /admin/providers (`autoApproved: false`).
 *
 * It cannot be done from the client: firestore.rules lets a user create only an unverified,
 * pending instructors document and never lets them set `providerProfile.isVerified`.
 *
 * Failures carry a stable code as the error message for the UI to localise: `invalid_vat`,
 * `invalid_business`, `invalid_business_name`, `invalid_legal_form`,
 * `invalid_affiliation_number` (over 40 characters), `invalid_website`,
 * `invalid_business_description`, `invalid_business_city`, `invalid_provider_type`,
 * `vat_already_registered` (tax id claimed by another account), `business_already_approved`
 * (an approved company re-applying — changes go through its profile or an admin),
 * `vat_change_not_allowed` (backstop for the same case, not expected in practice),
 * `business_account_exists` (a company re-applying as an individual) and `concurrent_update`
 * (lost a race — safe to retry).
 */
export async function applyAsProvider(data: {
  categoryIds: string[];
  fullName?: string;
  /** Absent ⇒ 'individual'. */
  providerType?: ProviderType;
  /** Required when `providerType` is 'business'. `displayName` defaults to `legalName`. */
  business?: {
    legalName: string;
    /** P.IVA / codice fiscale (an association without a P.IVA uses its codice fiscale). */
    vatNumber: string;
    /** Absent ⇒ 'company'. */
    legalForm?: BusinessLegalForm;
    /** Optional CONI / RASD / ente di promozione registration, at most 40 characters. */
    affiliationNumber?: string;
    displayName?: string;
    description?: string;
    website?: string;
    city?: string;
  };
}): Promise<{
  success: boolean;
  providerId: string;
  /** True when approved on the spot; false when queued for review. */
  autoApproved?: boolean;
  draftServicesSeeded: number;
}> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<
    typeof data,
    { success: boolean; providerId: string; autoApproved?: boolean; draftServicesSeeded: number }
  >(functions, "applyAsProvider");
  return (await fn(data)).data;
}

export interface ProviderOnboardingSettings {
  /** True: signup verifies the applicant immediately. False: it queues them for an admin. */
  autoApprove: boolean;
}

/** The current provider-onboarding settings. Admin only. */
export async function getProviderOnboardingSettings(): Promise<ProviderOnboardingSettings> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<void, ProviderOnboardingSettings>(
    functions,
    "getProviderOnboardingSettings",
  );
  return (await fn()).data;
}

/**
 * Turn provider auto-approval on or off. Admin only, and audited — this is the setting that
 * decides whether strangers can list themselves in the marketplace.
 */
export async function setProviderOnboardingSettings(
  data: ProviderOnboardingSettings,
): Promise<{ success: boolean; autoApprove: boolean }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, { success: boolean; autoApprove: boolean }>(
    functions,
    "setProviderOnboardingSettings",
  );
  return (await fn(data)).data;
}

/**
 * Turn Stripe payments and/or VIP subscription selling on or off. Superadmin only, audited.
 * Returns the full stored settings after the change.
 */
export async function setPaymentSettings(
  data: Partial<PaymentSettings>,
): Promise<{ success: boolean } & PaymentSettings> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, { success: boolean } & PaymentSettings>(
    functions,
    "setPaymentSettings",
  );
  return (await fn(data)).data;
}

/** What the admin had on screen when approving a company: its tax id and legal name. */
export interface BusinessReview {
  /** As shown — spaces and an `IT` prefix are ignored when compared. */
  vatNumber: string;
  /** As shown — compared trimmed, case-sensitive. */
  legalName: string;
}

export interface DecideProviderApplicationRequest {
  providerId: string;
  decision: "verified" | "rejected";
  notes?: string;
  /**
   * Required to approve a company (a provider whose instructors doc has a `business` map);
   * ignored for rejections and individuals. Send the values the detail view displayed.
   */
  expectedReview?: BusinessReview;
}

/**
 * An admin verifies or un-verifies a provider. With auto-approval on this is mostly the
 * revoking route; with it off it is how a pending application is decided. Verifying also
 * promotes the user to role 'provider' and seeds a draft service per requested category
 * (functions/src/providers/decideProviderApplication.ts).
 *
 * Approving a company fails with `failed-precondition` and a stable code as the message:
 * `review_required` (no `expectedReview` sent) or `stale_review` (the company's tax id or legal
 * name is no longer what was shown — it re-applied, or changed while the approval was in
 * flight): reload the detail view and review it again.
 */
export async function decideProviderApplication(
  data: DecideProviderApplicationRequest,
): Promise<{ success: boolean; draftServicesSeeded: number }> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, { success: boolean; draftServicesSeeded: number }>(
    functions,
    "decideProviderApplication",
  );
  return (await fn(data)).data;
}

// --- Business accounts: admin corrections (functions/src/providers/businessAdmin.ts) ---
// Admin or superadmin; each call is one transaction with its audit_logs entry. Failures carry a
// stable code as the message: `invalid_vat`, `invalid_business_name`, `invalid_legal_form`,
// `invalid_affiliation_number`, `invalid_provider_id`, `invalid_reason`, `claim_not_found`,
// `claim_in_use`, `not_a_business`, `provider_not_found`, `vat_already_registered`.

export interface ReleaseBusinessVatRequest {
  /** P.IVA / codice fiscale whose uniqueness claim to free. */
  vatNumber: string;
  reason?: string;
}

export interface ReleaseBusinessVatResult {
  success: boolean;
  /** Normalised (11 digits). */
  vatNumber: string;
  /** The uid that held the claim, or null when it named no usable account. */
  releasedFrom: string | null;
}

/**
 * Free a tax-id claim, e.g. a rejected company's or a squatter's. `not-found` /
 * `claim_not_found` when nobody holds it; `failed-precondition` / `claim_in_use` while the
 * holder's pending or approved company still carries the number (convert it, or change its tax
 * id, instead).
 */
export async function releaseBusinessVat(data: ReleaseBusinessVatRequest): Promise<ReleaseBusinessVatResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, ReleaseBusinessVatResult>(functions, "releaseBusinessVat");
  return (await fn(data)).data;
}

export interface ConvertBusinessToIndividualRequest {
  providerId: string;
  reason?: string;
}

export interface ConvertBusinessToIndividualResult {
  success: boolean;
  providerId: string;
  /** The tax-id claims that were released. */
  releasedClaims: string[];
}

/**
 * Turn a company back into an individual: removes `providerType` and the `business` map,
 * releases its tax-id claims and renames it to the person's own name. Verification is
 * unchanged. `failed-precondition` / `not_a_business` when it is not a company.
 */
export async function convertBusinessToIndividual(
  data: ConvertBusinessToIndividualRequest,
): Promise<ConvertBusinessToIndividualResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, ConvertBusinessToIndividualResult>(
    functions,
    "convertBusinessToIndividual",
  );
  return (await fn(data)).data;
}

export interface UpdateBusinessTaxIdRequest {
  providerId: string;
  /** Required: the new (or unchanged) P.IVA / codice fiscale. */
  vatNumber: string;
  /** The fields below change only when sent. */
  legalName?: string;
  /** `null` resets to 'company'. */
  legalForm?: BusinessLegalForm | null;
  /** `null` clears it. At most 40 characters. */
  affiliationNumber?: string | null;
  reason?: string;
}

export interface UpdateBusinessTaxIdResult {
  success: boolean;
  providerId: string;
  /** Normalised (11 digits). */
  vatNumber: string;
  /** Claims released by the move (empty when the number did not change). */
  releasedClaims: string[];
}

/**
 * Change a company's admin-owned fields (tax id, legal name, legal form, affiliation number) —
 * the owner can't, and a plain client write would leave the tax-id claim behind. The claim
 * moves with the number: `already-exists` / `vat_already_registered` when another account holds
 * it; `failed-precondition` / `not_a_business` when the provider is not a company.
 */
export async function updateBusinessTaxId(data: UpdateBusinessTaxIdRequest): Promise<UpdateBusinessTaxIdResult> {
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<typeof data, UpdateBusinessTaxIdResult>(functions, "updateBusinessTaxId");
  return (await fn(data)).data;
}
