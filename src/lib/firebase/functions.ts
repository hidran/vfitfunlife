import { httpsCallable } from "firebase/functions";
import { functions } from "./config";
import type { AppLocale } from "@/types/locale";
import type {
  AiStreamChunk,
  AiAssistantSettings,
  AiProviderId,
  ResultCard,
} from "@/types/assistant";
import type { BookingStatus, PaymentConfirmationMethod } from "@/types/firebase";

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
  const fn = httpsCallable<typeof data, BookingResult>(functions, "createBooking");
  const result = await fn(data);
  return result.data;
}

export async function cancelBooking(data: {
  bookingId: string;
  reason?: string;
}): Promise<CancelBookingResult> {
  const fn = httpsCallable<typeof data, CancelBookingResult>(functions, "cancelBooking");
  const result = await fn(data);
  return result.data;
}

export async function confirmBooking(data: {
  bookingId: string;
}): Promise<{ success: boolean }> {
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

/** Trainer records a payment received off-platform. Amount is revalidated server-side. */
export function confirmBookingPayment(data: {
  bookingId: string;
  method: PaymentConfirmationMethod;
  amount: number;
}) {
  return callTransition("confirmBookingPayment", data);
}

/** Client's optional confirm-or-dispute. Silence auto-confirms after 48h. */
export async function respondToPaymentConfirmation(data: {
  bookingId: string;
  response: "confirmed" | "disputed";
  disputeReason?: string;
}): Promise<{ success: boolean; bookingId: string; response: string }> {
  const fn = httpsCallable<typeof data, { success: boolean; bookingId: string; response: string }>(
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
  const fn = httpsCallable<typeof data, {
    dryRun: boolean; scanned: number; migrated: number;
    skipped: number; instructorIdBackfilled: number; counts: Record<string, number>;
  }>(functions, "migrateBookingStatuses");
  const result = await fn(data);
  return result.data;
}

// Payment functions
export async function createStripeCustomer(): Promise<{ customerId: string }> {
  const fn = httpsCallable<void, { customerId: string }>(functions, "createStripeCustomer");
  const result = await fn();
  return result.data;
}

export async function createPaymentIntent(data: {
  bookingId: string;
  isDeposit?: boolean;
}): Promise<PaymentIntentResult> {
  const fn = httpsCallable<typeof data, PaymentIntentResult>(functions, "createPaymentIntent");
  const result = await fn(data);
  return result.data;
}

export async function createVipSubscription(data: {
  planId: string;
}): Promise<SubscriptionResult> {
  const fn = httpsCallable<typeof data, SubscriptionResult>(functions, "createVipSubscription");
  const result = await fn(data);
  return result.data;
}

export async function addWalletFunds(data: {
  amount: number;
}): Promise<{ clientSecret: string }> {
  const fn = httpsCallable<typeof data, { clientSecret: string }>(functions, "addWalletFunds");
  const result = await fn(data);
  return result.data;
}

// User functions
export async function applyReferralCode(data: {
  referralCode: string;
}): Promise<ReferralResult> {
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
  const fn = httpsCallable<typeof data, { success: boolean }>(functions, "updateProfile");
  const result = await fn(data);
  return result.data;
}

export async function getUserStats(): Promise<UserStatsResult> {
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
  const fn = httpsCallable<typeof data, { addressId: string }>(functions, "saveAddress");
  const result = await fn(data);
  return result.data;
}

export async function deleteAddress(data: {
  addressId: string;
}): Promise<{ success: boolean }> {
  const fn = httpsCallable<typeof data, { success: boolean }>(functions, "deleteAddress");
  const result = await fn(data);
  return result.data;
}

export async function getLeaderboard(data: {
  type?: "points" | "bookings";
  limit?: number;
}): Promise<LeaderboardResult> {
  const fn = httpsCallable<typeof data, LeaderboardResult>(functions, "getLeaderboard");
  const result = await fn(data);
  return result.data;
}

export async function submitReview(data: {
  bookingId: string;
  rating: number;
  comment?: string;
  images?: string[];
}): Promise<ReviewResult> {
  const fn = httpsCallable<typeof data, ReviewResult>(functions, "submitReview");
  const result = await fn(data);
  return result.data;
}

// Notification functions
export async function registerFcmToken(data: {
  token: string;
  platform: "ios" | "android" | "web";
}): Promise<{ success: boolean }> {
  const fn = httpsCallable<typeof data, { success: boolean }>(functions, "registerFcmToken");
  const result = await fn(data);
  return result.data;
}

export async function markNotificationRead(data: {
  notificationId: string;
}): Promise<{ success: boolean }> {
  const fn = httpsCallable<typeof data, { success: boolean }>(functions, "markNotificationRead");
  const result = await fn(data);
  return result.data;
}

export async function markAllNotificationsRead(): Promise<{ markedCount: number }> {
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
export function streamAssistant(input: { chatId?: string; message: string; locale: string }) {
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
  const fn = httpsCallable<
    void,
    { settings: AiAssistantSettings; keyPresence: Record<AiProviderId, boolean> }
  >(functions, "getAiSettingsAdmin");
  return (await fn()).data;
}

export async function updateAiSettings(patch: Partial<AiAssistantSettings>): Promise<void> {
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
  const fn = httpsCallable<typeof input, { ok: boolean; sample?: string; error?: string }>(
    functions,
    "testAiConnection",
  );
  return (await fn(input)).data;
}

export async function migrateInstructorCatalog(): Promise<{ scanned: number; updated: number; skippedCity?: number; skippedActivity?: number }> {
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
  const fn = httpsCallable<
    void,
    { settings: AiAuthoringSettings; keyPresence: Record<AiProviderId, boolean> }
  >(functions, "getAiAuthoringSettingsAdmin");
  return (await fn()).data;
}

export async function updateAiAuthoringSettings(patch: Partial<AiAuthoringSettings>): Promise<void> {
  const fn = httpsCallable<Partial<AiAuthoringSettings>, { success: boolean }>(
    functions,
    "updateAiAuthoringSettings",
  );
  await fn(patch);
}
