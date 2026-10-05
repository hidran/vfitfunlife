"use client";

import { isProviderVerified, needsVerificationDecision } from "@/lib/providerVerification";

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  setDoc,
  Timestamp,
  startAfter,
  QueryConstraint,
  QueryDocumentSnapshot,
  getCountFromServer,
  writeBatch,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, getFunctionsInstance } from "./config";
import { countOrFallback, sumOrFallback } from "./firestore";
import { demoDashboardShare } from "@/lib/demo";
import { normalizeSearchQuery } from "@/lib/admin/adminIndex";
import { BOOKING_DISPUTED_FILTER } from "@/lib/admin/bookingsListQuery";
import type { SystemLogAction } from "@/lib/admin/logsListQuery";
import { cancelBooking as cancelBookingFn, decideProviderApplication } from "./functions";
import {
  AdminDashboardStats,
  UserFilters,
  ProviderFilters,
  BookingFilters,
  LogFilters,
  PlatformSettings,
  SystemLog,
  UserTypeData,
  ServiceCategoryData,
  VerificationData,
  AnnouncementData,
  AdminUser,
  AdminProvider,
  AdminTransaction,
  PayoutRequest,
  BulkActionResult,
} from "@/types/admin";
import { Booking, User, UserRole } from "@/types/firebase";

const ADMIN_COLLECTION = "admins";
const USERS_COLLECTION = "users";
const PROVIDERS_COLLECTION = "providers";
const BOOKINGS_COLLECTION = "bookings";
const LOGS_COLLECTION = "systemLogs";
const SETTINGS_DOC = "platform/settings";
const USER_TYPES_COLLECTION = "userTypes";
const SERVICE_CATEGORIES_COLLECTION = "serviceCategories";
const TRANSACTIONS_COLLECTION = "transactions";
const PAYOUTS_COLLECTION = "payoutRequests";

// Helper to convert Firestore timestamp to Date
const convertTimestamps = (data: any): any => {
  if (!data) return data;
  if (data instanceof Timestamp) return data.toDate();
  if (data instanceof Date) return data;
  // Preserve arrays: spreading an array into an object ({ ...array }) would turn
  // it into a plain object with numeric keys, breaking downstream .map()/.length
  // (e.g. providerProfile.specialties). Map each element through instead.
  if (Array.isArray(data)) return data.map((item) => convertTimestamps(item));
  if (typeof data === "object") {
    const result: Record<string, any> = {};
    for (const key in data) {
      result[key] = convertTimestamps(data[key]);
    }
    return result;
  }
  return data;
};

// Seeded demo accounts use the @demo.vfit email domain and/or a `provider_<timestamp>_<n>`
// / `customer_<timestamp>_<n>` document id rather than a real Firebase Auth uid — no real
// uid ever starts with either prefix.
const DEMO_EMAIL_DOMAIN = "@demo.vfit";

/**
 * Why a user/provider document is hidden from admin lists, or null when it isn't:
 * 'deleted' for a soft-deleted account (isDeleted / deletedAt), 'demo' for a seeded demo
 * account. 'deleted' takes precedence — a soft-deleted seed account is still shown as
 * deleted, not demo. Exported so callers that need to distinguish the two (e.g. the users
 * table's status badge) share this one rule with the list filter instead of redefining it.
 * Applied client-side because a Firestore `!=` filter on isDeleted would also exclude the
 * (vast majority of) real docs that simply lack the field.
 */
export function hiddenAccountKind(id: string, data: any): "deleted" | "demo" | null {
  if (!data) return null;
  if (data.isDeleted === true || data.deletedAt) return "deleted";
  const email = typeof data.email === "string" ? data.email.toLowerCase() : "";
  const isSeedId = typeof id === "string" && (id.startsWith("provider_") || id.startsWith("customer_"));
  if (email.endsWith(DEMO_EMAIL_DOMAIN) || isSeedId) return "demo";
  return null;
}

const isHiddenAccount = (id: string, data: any): boolean => hiddenAccountKind(id, data) !== null;

/**
 * The bounded set of documents that could possibly need a verification decision, read instead
 * of the entire `users` collection.
 *
 * `needsVerificationDecision` (src/lib/providerVerification.ts) can only return true for a
 * document that is either `providerStatus == 'pending'` or `role == 'provider'` — every other
 * document is unconditionally `false`. So the union of those two precise, single-field-equality
 * queries (the same query shapes `getProviders` below already uses, needing no extra index)
 * contains every candidate, and nothing outside it. It cannot be narrowed further into a plain
 * count: `needsVerificationDecision` and `isHiddenAccount` both hinge on fields (`providerProfile
 * .isVerified`, `isVerified`, `isDeleted`) being *absent*, and a Firestore equality/inequality
 * filter never matches a missing field, so the final filter has to run in memory over real
 * documents. This still cuts what's read from "every user" to "every provider plus every
 * pending applicant" — a full scan turns into two small, precise reads.
 */
async function fetchPendingVerificationCandidates(): Promise<QueryDocumentSnapshot[]> {
  const usersRef = collection(db, USERS_COLLECTION);
  const [roleSnapshot, statusSnapshot] = await Promise.all([
    getDocs(query(usersRef, where("role", "==", "provider"))),
    getDocs(query(usersRef, where("providerStatus", "==", "pending"))),
  ]);

  const byId = new Map<string, QueryDocumentSnapshot>();
  for (const snapshot of [roleSnapshot, statusSnapshot]) {
    for (const d of snapshot.docs) byId.set(d.id, d);
  }
  return [...byId.values()];
}

/** Shared by the dashboard counter and the verification queue, so they can never disagree. */
function filterNeedsVerificationDecision(docs: QueryDocumentSnapshot[]): QueryDocumentSnapshot[] {
  return docs.filter((d) => !isHiddenAccount(d.id, d.data()) && needsVerificationDecision(d.data()));
}

// Get admin dashboard stats
export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  try {
    const usersRef = collection(db, USERS_COLLECTION);

    // Active providers count
    const providersQuery = query(
      usersRef,
      where("role", "==", "provider"),
      where("providerProfile.isActive", "==", true)
    );

    // Today's bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayQuery = query(
      collection(db, BOOKINGS_COLLECTION),
      where("scheduledAt", ">=", Timestamp.fromDate(today))
    );

    // Monthly revenue
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const revenueQuery = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where("createdAt", ">=", Timestamp.fromDate(firstDayOfMonth)),
      where("type", "==", "booking_payment"),
      where("status", "==", "completed")
    );

    // Recent activity
    const activityQuery = query(
      collection(db, LOGS_COLLECTION),
      orderBy("timestamp", "desc"),
      limit(10)
    );

    // None of these six reads depends on another's result, so they run together instead of
    // one after another. totalUsers, activeProviders and todayBookings only ever needed a
    // count and monthlyRevenue only ever needed a sum — reading every matching document with
    // getDocs just to call `.size`/reduce over `.amount` threw the documents away unread.
    // pendingVerifications still needs real documents (see fetchPendingVerificationCandidates
    // above), but no longer the entire `users` collection.
    //
    // countOrFallback/sumOrFallback (src/lib/firebase/firestore.ts): confirmed live against
    // staging that the revenue sum needs its OWN composite index (transactions: status, type,
    // createdAt, **amount**) beyond the one the equivalent getDocs() query already uses — a sum
    // aggregation needs the summed field in the index, which a filter-only index doesn't carry.
    // These fall back to the getDocs()-computed answer on any aggregation failure, so a missing
    // or still-building index costs reads, not a broken dashboard.
    //
    // D5: demo accounts and their bookings/transactions (`isDemo: true`) must not count. The
    // demo documents are a handful, read with one single-field equality query per collection,
    // and their share of each counter (same predicates, see demoDashboardShare) is subtracted.
    const isDemo = where("isDemo", "==", true);
    const [
      totalUsers,
      activeProviders,
      todayBookings,
      monthlyRevenue,
      pendingCandidates,
      activitySnapshot,
      demoUsers,
      demoBookings,
      demoTransactions,
    ] = await Promise.all([
      countOrFallback(usersRef),
      countOrFallback(providersQuery),
      countOrFallback(todayQuery),
      sumOrFallback(revenueQuery, "amount"),
      fetchPendingVerificationCandidates(),
      getDocs(activityQuery),
      getDocs(query(usersRef, isDemo)),
      getDocs(query(collection(db, BOOKINGS_COLLECTION), isDemo)),
      getDocs(query(collection(db, TRANSACTIONS_COLLECTION), isDemo)),
    ]);

    const demo = demoDashboardShare({
      users: demoUsers.docs.map((d) => d.data()),
      bookings: demoBookings.docs.map((d) => d.data()),
      transactions: demoTransactions.docs.map((d) => d.data()),
      todayStart: today,
      monthStart: firstDayOfMonth,
    });

    const pendingVerifications = filterNeedsVerificationDecision(pendingCandidates).length;

    const recentActivity = activitySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data()),
    })) as AdminDashboardStats["recentActivity"];

    // Clamped: a count that raced a write can momentarily be below its demo share.
    const real = (all: number, demoPart: number) => Math.max(0, all - demoPart);
    return {
      totalUsers: real(totalUsers, demo.totalUsers),
      activeProviders: real(activeProviders, demo.activeProviders),
      todayBookings: real(todayBookings, demo.todayBookings),
      monthlyRevenue: real(monthlyRevenue, demo.monthlyRevenue),
      pendingVerifications,
      openTickets: 0, // Would come from support tickets collection
      recentActivity,
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    throw error;
  }
}

/**
 * Last document of each page already read, keyed by page number — the `startAfter` cursor of
 * the page after it. Owned by the caller (the admin store keeps one per filter combination)
 * so next/previous and reloads of a visited page are one `limit(pageSize)` read each.
 */
export type PageCursors = Map<number, QueryDocumentSnapshot>;

export interface ListPageResult {
  docs: QueryDocumentSnapshot[];
  total: number;
  cursors: PageCursors;
}

/**
 * One page of an admin list, filtered server-side and ordered newest first by `orderField`,
 * plus the filtered total. Shared by the users, providers, bookings and system-logs lists.
 *
 * Page 1 and any page whose predecessor's cursor is known read exactly `pageSize` documents.
 * A page reached without one (a `?page=N` URL, the "last page" button) reads the N pages up to
 * it in one query and records every cursor on the way, so moving around from there is cheap
 * again. The total is a `getCountFromServer` over the same filters and orderBy (no limit).
 */
async function fetchListPage(
  collectionName: string,
  orderField: string,
  filterConstraints: QueryConstraint[],
  page: number,
  pageSize: number,
  cursors: PageCursors = new Map()
): Promise<ListPageResult> {
  const listRef = collection(db, collectionName);
  const ordered = [...filterConstraints, orderBy(orderField, "desc")];
  const before = page > 1 ? cursors.get(page - 1) : undefined;
  const direct = page === 1 || before !== undefined;

  const pageQuery = direct
    ? query(listRef, ...ordered, ...(before ? [startAfter(before)] : []), limit(pageSize))
    : query(listRef, ...ordered, limit(page * pageSize));

  const [snapshot, count] = await Promise.all([
    getDocs(pageQuery),
    // Counted with the same orderBy as the pages: it drops documents lacking the order field
    // exactly as the pages do (so the total matches what paging can reach), and a date range
    // on that field then uses the same descending index instead of needing an ascending twin.
    getCountFromServer(query(listRef, ...ordered)),
  ]);

  const nextCursors: PageCursors = new Map(cursors);
  let docs: QueryDocumentSnapshot[];
  if (direct) {
    docs = snapshot.docs;
  } else {
    // Every full page read on the way is a cursor for later.
    for (let p = 1; p < page && p * pageSize <= snapshot.docs.length; p++) {
      nextCursors.set(p, snapshot.docs[p * pageSize - 1]);
    }
    docs = snapshot.docs.slice((page - 1) * pageSize);
  }
  if (docs.length > 0) nextCursors.set(page, docs[docs.length - 1]);

  return { docs, total: count.data().count, cursors: nextCursors };
}

/** Doc id last, so a stray id/uid field in the data never wins over the document's own id. */
const toAdminRecord = <T>(d: QueryDocumentSnapshot): T =>
  ({ ...convertTimestamps(d.data()), id: d.id, uid: d.id }) as T;

/** The `searchTokens` constraint for a search box value, or none when there is nothing to find. */
function searchConstraint(search: string | undefined): QueryConstraint[] {
  const token = search ? normalizeSearchQuery(search) : "";
  return token ? [where("searchTokens", "array-contains", token)] : [];
}

/** `isSuspended` is on every user document (P0-9 backfill + the admin-index trigger). */
function suspensionConstraint(status: string | undefined): QueryConstraint[] {
  if (status === "active") return [where("isSuspended", "==", false)];
  if (status === "suspended") return [where("isSuspended", "==", true)];
  return [];
}

/**
 * The Firestore filters of a users list query. Each combination has its composite index in
 * firestore.indexes.json (scripts/verify-admin-list-indexes.mjs checks the shapes).
 */
export function userListConstraints(filters: UserFilters): QueryConstraint[] {
  const constraints: QueryConstraint[] = [
    // "hidden" (soft-deleted or seeded demo, see hiddenAccountKind) is the only way to reach
    // those accounts — which the bulk delete needs; every other status excludes them.
    where("adminHidden", "==", filters.status === "hidden"),
  ];
  if (filters.role && filters.role !== "all") constraints.push(where("role", "==", filters.role));
  constraints.push(...suspensionConstraint(filters.status));
  constraints.push(...searchConstraint(filters.search));
  if (filters.dateFrom) constraints.push(where("createdAt", ">=", Timestamp.fromDate(filters.dateFrom)));
  if (filters.dateTo) constraints.push(where("createdAt", "<=", Timestamp.fromDate(filters.dateTo)));
  return constraints;
}

// Get users with filters — one page, filtered, searched and counted server-side.
export async function getUsers(
  filters: UserFilters,
  cursors?: PageCursors
): Promise<{ users: AdminUser[]; total: number; cursors: PageCursors }> {
  try {
    const result = await fetchListPage(
      USERS_COLLECTION,
      "createdAt",
      userListConstraints(filters),
      filters.page || 1,
      filters.limit || 20,
      cursors
    );
    return {
      users: result.docs.map((d) => toAdminRecord<AdminUser>(d)),
      total: result.total,
      cursors: result.cursors,
    };
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  }
}

// Update user role
export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      role,
      updatedAt: serverTimestamp(),
    });

    // Log action
    await logAdminAction("UPDATE_USER_ROLE", `Updated user ${userId} role to ${role}`);
  } catch (error) {
    console.error("Error updating user role:", error);
    throw error;
  }
}

// Suspend user
export async function suspendUser(userId: string, reason: string): Promise<void> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      isSuspended: true,
      suspensionReason: reason,
      suspendedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("SUSPEND_USER", `Suspended user ${userId}. Reason: ${reason}`);
  } catch (error) {
    console.error("Error suspending user:", error);
    throw error;
  }
}

// Activate user
export async function activateUser(userId: string): Promise<void> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      isSuspended: false,
      suspensionReason: null,
      suspendedAt: null,
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("ACTIVATE_USER", `Activated user ${userId}`);
  } catch (error) {
    console.error("Error activating user:", error);
    throw error;
  }
}

/** Where a provider (or provider applicant) stands in the verification flow. */
export type ProviderVerificationState = "verified" | "pending" | "rejected";

/**
 * One answer for the providers table's badge and its verification filter, built on the same
 * predicates as the dashboard counter and the verification queue (`needsVerificationDecision`,
 * `isProviderVerified`) so the three never disagree.
 *
 * `providerStatus` decides first: an applicant is still `role: 'customer'` while pending or
 * after a rejection, so a rejected applicant must never fall into "pending" just because it is
 * unverified.
 */
export function providerVerificationState(record: {
  role?: string;
  providerStatus?: string;
  providerProfile?: { isVerified?: boolean } | null;
  isVerified?: boolean;
}): ProviderVerificationState {
  if (record.providerStatus === "rejected") return "rejected";
  if (needsVerificationDecision(record)) return "pending";
  return isProviderVerified(record) ? "verified" : "pending";
}

/** Every value `providerVerification` takes for a provider or applicant (null otherwise). */
const PROVIDER_VERIFICATION_STATES: ProviderVerificationState[] = ["verified", "pending", "rejected"];

/**
 * The Firestore filters of a providers list query. `providerVerification` is derived by the
 * admin-index trigger with the same rule as providerVerificationState, so the "pending" filter
 * and the verification queue (getPendingVerifications) always name the same people.
 * `providerKind` (same trigger) is the account type: individuals have no `providerType` field
 * for an equality filter to match, so the derived field is what makes "individuals" queryable.
 * Existing documents get it on their next write (or from scripts/backfill-search-tokens.mjs).
 */
export function providerListConstraints(filters: ProviderFilters): QueryConstraint[] {
  const wanted = filters.verificationStatus ?? "all";
  const kind = filters.providerType ?? "all";
  return [
    where("adminHidden", "==", false),
    wanted === "all"
      ? where("providerVerification", "in", PROVIDER_VERIFICATION_STATES)
      : where("providerVerification", "==", wanted),
    ...(kind === "all" ? [] : [where("providerKind", "==", kind)]),
    ...suspensionConstraint(filters.status),
    ...searchConstraint(filters.search),
  ];
}

// Get providers with filters — providers and applicants, one page, server-side.
export async function getProviders(
  filters: ProviderFilters,
  cursors?: PageCursors
): Promise<{ providers: AdminProvider[]; total: number; cursors: PageCursors }> {
  try {
    const result = await fetchListPage(
      USERS_COLLECTION,
      "createdAt",
      providerListConstraints(filters),
      filters.page || 1,
      filters.limit || 20,
      cursors
    );
    return {
      providers: result.docs.map((d) => toAdminRecord<AdminProvider>(d)),
      total: result.total,
      cursors: result.cursors,
    };
  } catch (error) {
    console.error("Error fetching providers:", error);
    throw error;
  }
}

// Get pending verifications
export async function getPendingVerifications(): Promise<AdminProvider[]> {
  try {
    // Reads only the candidate set (see fetchPendingVerificationCandidates), not the entire
    // `users` collection, then applies the same in-memory hidden-account/needs-decision filter
    // as before — no orderBy, since `orderBy('createdAt')` would drop every document that has
    // no createdAt. Sorted in memory instead, so a record missing it still shows up as work to
    // do.
    const candidates = await fetchPendingVerificationCandidates();

    return (filterNeedsVerificationDecision(candidates)
      .map((doc) => ({
        id: doc.id,
        uid: doc.id,
        ...convertTimestamps(doc.data()),
      })) as AdminProvider[])
      .sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt as unknown as string).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt as unknown as string).getTime() : 0;
        return bt - at;
      });
  } catch (error) {
    console.error("Error fetching pending verifications:", error);
    throw error;
  }
}

/**
 * Approve a provider.
 *
 * Delegates to the decideProviderApplication callable — the single owner of this
 * transition. This used to write `providerProfile.isVerified` from the browser and nothing
 * else, which is not what makes someone a provider: `users/{uid}.providerStatus` stayed
 * 'pending', so the approved provider went on seeing "application under review" and stayed
 * locked out of /provider/*, while the row vanished from the verification queue as if the
 * approval had worked. The callable also promotes the role, creates the instructors
 * catalogue entry, gives them default hours and seeds a draft service per requested
 * category, and writes the audit entry in the same batch.
 *
 * `data` is kept for the call sites that pass verification notes; the timestamps and the
 * acting admin are recorded server-side.
 *
 * A company (instructors doc with a `business` map) is approved only with `expectedReview`:
 * the tax id, legal name, legal form and affiliation number the admin had on screen. The server refuses with `review_required`
 * without it and `stale_review` when they no longer match — the caller reloads and says so.
 * An individual's payload is unchanged.
 */
export async function verifyProvider(
  providerId: string,
  data: VerificationData
): Promise<void> {
  const review = data.expectedReview;
  await decideProviderApplication({
    providerId,
    decision: "verified",
    ...(data.notes ? { notes: data.notes } : {}),
    ...(review ? { expectedReview: { ...review } } : {}),
  });
  await logAdminAction("VERIFY_PROVIDER", `Verified provider ${providerId}`);
}

/** Reject a provider, through the same callable that owns approval. */
export async function rejectProvider(providerId: string, reason: string): Promise<void> {
  await decideProviderApplication({ providerId, decision: "rejected", notes: reason });
  await logAdminAction("REJECT_PROVIDER", `Rejected provider ${providerId}. Reason: ${reason}`);
}

/**
 * Bookings are listed by session date, latest first: the date-range filter is on
 * `scheduledAt`, and Firestore needs a range filter's field to be the first orderBy, so
 * ordering by it too keeps every filter combination one indexed query.
 */
const BOOKINGS_ORDER_FIELD = "scheduledAt";

/**
 * What the bookings search box can find server-side. Firestore has no substring search and
 * bookings carry no search tokens, so the box matches exact values only:
 * - an email → `userEmail ==` (the customer's email, lowercased), paged like any filter;
 * - anything else → a booking id (one document read), else a customer uid (`userId ==`),
 *   else a provider uid (`instructorId ==`).
 * Names and the short "#ABC123" code shown in the table are NOT searchable.
 */
export type BookingSearch = { kind: "email"; value: string } | { kind: "id"; value: string };

export function bookingSearch(search: string | undefined): BookingSearch | null {
  const value = (search ?? "").trim();
  if (!value) return null;
  if (value.includes("@")) return { kind: "email", value: value.toLowerCase() };
  return { kind: "id", value };
}

/**
 * The Firestore filters of a bookings list query, without the search (see getBookings).
 * Each combination is served by firestore.indexes.json — checked by
 * scripts/verify-admin-list-indexes.mjs.
 */
export function bookingListConstraints(filters: BookingFilters): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];
  if (filters.status === BOOKING_DISPUTED_FILTER) {
    constraints.push(where("paymentConfirmation.clientResponse", "==", "disputed"));
  } else if (filters.status && filters.status !== "all") {
    constraints.push(where("status", "==", filters.status));
  }
  // Bookings name their provider `instructorId` (there is no providerId field).
  if (filters.providerId) constraints.push(where("instructorId", "==", filters.providerId));
  if (filters.customerId) constraints.push(where("userId", "==", filters.customerId));
  if (filters.dateFrom) {
    constraints.push(where(BOOKINGS_ORDER_FIELD, ">=", Timestamp.fromDate(filters.dateFrom)));
  }
  if (filters.dateTo) {
    constraints.push(where(BOOKINGS_ORDER_FIELD, "<=", Timestamp.fromDate(filters.dateTo)));
  }
  return constraints;
}

const toDateOrNull = (value: unknown): Date | null =>
  value instanceof Date ? value : value instanceof Timestamp ? value.toDate() : null;

/** bookingListConstraints evaluated in memory, for the single booking a by-id search found. */
function bookingMatchesFilters(booking: Booking, filters: BookingFilters): boolean {
  if (filters.status === BOOKING_DISPUTED_FILTER) {
    if (booking.paymentConfirmation?.clientResponse !== "disputed") return false;
  } else if (filters.status && filters.status !== "all" && booking.status !== filters.status) {
    return false;
  }
  if (filters.providerId && booking.instructorId !== filters.providerId) return false;
  if (filters.customerId && booking.userId !== filters.customerId) return false;
  const at = toDateOrNull(booking.scheduledAt);
  if (filters.dateFrom && (!at || at < filters.dateFrom)) return false;
  if (filters.dateTo && (!at || at > filters.dateTo)) return false;
  return true;
}

export interface BookingsPage {
  bookings: Booking[];
  total: number;
  cursors: PageCursors;
}

// Get bookings with filters — one page, filtered, searched and counted server-side.
export async function getBookings(
  filters: BookingFilters,
  cursors?: PageCursors
): Promise<BookingsPage> {
  try {
    const page = filters.page || 1;
    const pageSize = filters.limit || 20;
    const base = bookingListConstraints(filters);
    const toBookings = (result: ListPageResult): BookingsPage => ({
      bookings: result.docs.map((d) => ({ ...convertTimestamps(d.data()), id: d.id }) as Booking),
      total: result.total,
      cursors: result.cursors,
    });
    const listPage = (extra: QueryConstraint[]) =>
      fetchListPage(BOOKINGS_COLLECTION, BOOKINGS_ORDER_FIELD, [...base, ...extra], page, pageSize, cursors);

    const search = bookingSearch(filters.search);
    if (!search) return toBookings(await listPage([]));
    if (search.kind === "email") return toBookings(await listPage([where("userEmail", "==", search.value)]));

    // A document id can't contain "/"; doc() would read it as a path.
    if (!search.value.includes("/")) {
      const snapshot = await getDoc(doc(db, BOOKINGS_COLLECTION, search.value));
      if (snapshot.exists()) {
        const booking = { ...convertTimestamps(snapshot.data()), id: snapshot.id } as Booking;
        const hit = bookingMatchesFilters(booking, filters);
        return { bookings: hit && page === 1 ? [booking] : [], total: hit ? 1 : 0, cursors: new Map() };
      }
    }
    // Not a booking id: the customer's bookings, else the provider's.
    const asCustomer = await listPage([where("userId", "==", search.value)]);
    if (asCustomer.total > 0) return toBookings(asCustomer);
    return toBookings(await listPage([where("instructorId", "==", search.value)]));
  } catch (error) {
    console.error("Error fetching bookings:", error);
    throw error;
  }
}

/**
 * Cancel a booking as admin.
 *
 * Goes through the `cancelBooking` callable rather than writing the document. Admin still
 * has rules-level update access, but a direct write would skip the statusHistory entry and
 * the actorRole attribution that P0-2's trainer-reliability metric depends on — an admin
 * cancellation must not read as the trainer's.
 */
export async function cancelBookingAdmin(bookingId: string, reason: string): Promise<void> {
  try {
    await cancelBookingFn({ bookingId, reason });
    await logAdminAction("CANCEL_BOOKING", `Cancelled booking ${bookingId}. Reason: ${reason}`);
  } catch (error) {
    console.error("Error cancelling booking:", error);
    throw error;
  }
}

// Process refund
export async function processRefund(bookingId: string, amount: number): Promise<void> {
  try {
    // This would typically call a Cloud Function to handle Stripe refund
    const functions = await getFunctionsInstance();
    const processRefundFn = httpsCallable(functions, "processRefund");
    await processRefundFn({ bookingId, amount });

    await logAdminAction("PROCESS_REFUND", `Processed refund of ${amount} for booking ${bookingId}`);
  } catch (error) {
    console.error("Error processing refund:", error);
    throw error;
  }
}

// Get platform settings
export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const settingsRef = doc(db, SETTINGS_DOC);
    const snapshot = await getDoc(settingsRef);

    if (snapshot.exists()) {
      return convertTimestamps(snapshot.data()) as PlatformSettings;
    }

    // Return default settings
    return {
      platformName: "VFit",
      commissionPercentage: 15,
      cancellationPolicy: "24 hours",
      currency: "EUR",
      supportEmail: "support@vfit.com",
    };
  } catch (error) {
    console.error("Error fetching platform settings:", error);
    throw error;
  }
}

// Update platform settings
export async function updatePlatformSettings(settings: PlatformSettings): Promise<void> {
  try {
    const settingsRef = doc(db, SETTINGS_DOC);
    // setDoc/merge, not updateDoc: getPlatformSettings returns hardcoded defaults when the
    // document is missing, so the very first save was always against a document that did
    // not exist — and updateDoc fails outright on those rather than creating one.
    await setDoc(
      settingsRef,
      {
        ...settings,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await logAdminAction("UPDATE_SETTINGS", "Updated platform settings");
  } catch (error) {
    console.error("Error updating platform settings:", error);
    throw error;
  }
}

/**
 * The Firestore filters of a system-logs list query. The actor is stored as `by` (the acting
 * admin's uid, see logAdminAction); `userId` and the search box both filter on it — the search
 * is an exact uid match, since log entries carry no search tokens. Each combination is served
 * by firestore.indexes.json (scripts/verify-admin-list-indexes.mjs).
 */
export function logListConstraints(filters: LogFilters): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];
  if (filters.severity && filters.severity !== "all") {
    constraints.push(where("severity", "==", filters.severity));
  }
  if (filters.action && filters.action !== "all") constraints.push(where("action", "==", filters.action));
  const actor = filters.userId || filters.search?.trim();
  if (actor) constraints.push(where("by", "==", actor));
  if (filters.dateFrom) constraints.push(where("timestamp", ">=", Timestamp.fromDate(filters.dateFrom)));
  if (filters.dateTo) constraints.push(where("timestamp", "<=", Timestamp.fromDate(filters.dateTo)));
  return constraints;
}

// Get system logs — one page, filtered and counted server-side, newest first.
export async function getSystemLogs(
  filters: LogFilters,
  cursors?: PageCursors
): Promise<{ logs: SystemLog[]; total: number; cursors: PageCursors }> {
  try {
    const result = await fetchListPage(
      LOGS_COLLECTION,
      "timestamp",
      logListConstraints(filters),
      filters.page || 1,
      filters.limit || 50,
      cursors
    );
    return {
      logs: result.docs.map((d) => ({ ...convertTimestamps(d.data()), id: d.id }) as SystemLog),
      total: result.total,
      cursors: result.cursors,
    };
  } catch (error) {
    console.error("Error fetching system logs:", error);
    throw error;
  }
}

// Create user type
export async function createUserType(data: UserTypeData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, USER_TYPES_COLLECTION), {
      ...data,
      slug: data.name.toLowerCase().replace(/\s+/g, "-"),
      associatedProvidersCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("CREATE_USER_TYPE", `Created user type: ${data.name}`);
    return docRef.id;
  } catch (error) {
    console.error("Error creating user type:", error);
    throw error;
  }
}

// Update user type
export async function updateUserType(id: string, data: UserTypeData): Promise<void> {
  try {
    const typeRef = doc(db, USER_TYPES_COLLECTION, id);
    await updateDoc(typeRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("UPDATE_USER_TYPE", `Updated user type: ${data.name}`);
  } catch (error) {
    console.error("Error updating user type:", error);
    throw error;
  }
}

// Delete user type
export async function deleteUserType(id: string): Promise<void> {
  try {
    const typeRef = doc(db, USER_TYPES_COLLECTION, id);
    await updateDoc(typeRef, {
      isActive: false,
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("DELETE_USER_TYPE", `Deleted user type: ${id}`);
  } catch (error) {
    console.error("Error deleting user type:", error);
    throw error;
  }
}

// Create service category
export async function createServiceCategory(data: ServiceCategoryData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, SERVICE_CATEGORIES_COLLECTION), {
      ...data,
      slug: (data.names?.it ?? "").toLowerCase().trim().replace(/\s+/g, "-"),
      order: data.order ?? 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("CREATE_SERVICE_CATEGORY", `Created service category: ${data.names?.it ?? ""}`);
    return docRef.id;
  } catch (error) {
    console.error("Error creating service category:", error);
    throw error;
  }
}

// Update service category
export async function updateServiceCategory(id: string, data: ServiceCategoryData): Promise<void> {
  try {
    const ref = doc(db, SERVICE_CATEGORIES_COLLECTION, id);
    await updateDoc(ref, {
      ...data,
      slug: (data.names?.it ?? "").toLowerCase().trim().replace(/\s+/g, "-"),
      order: data.order ?? 0,
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("UPDATE_SERVICE_CATEGORY", `Updated service category: ${data.names?.it ?? ""}`);
  } catch (error) {
    console.error("Error updating service category:", error);
    throw error;
  }
}

// Delete service category (soft delete: mark inactive)
export async function deleteServiceCategory(id: string): Promise<void> {
  try {
    const ref = doc(db, SERVICE_CATEGORIES_COLLECTION, id);
    await updateDoc(ref, {
      isActive: false,
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("DELETE_SERVICE_CATEGORY", `Deleted service category: ${id}`);
  } catch (error) {
    console.error("Error deleting service category:", error);
    throw error;
  }
}

// Create announcement
export async function createAnnouncement(data: AnnouncementData): Promise<void> {
  try {
    await addDoc(collection(db, "announcements"), {
      ...data,
      createdAt: serverTimestamp(),
      sentAt: data.scheduledAt ? null : serverTimestamp(),
      status: data.scheduledAt ? "scheduled" : "sent",
    });

    await logAdminAction("CREATE_ANNOUNCEMENT", `Created announcement: ${data.title}`);
  } catch (error) {
    console.error("Error creating announcement:", error);
    throw error;
  }
}

// Bulk update users
export async function bulkUpdateUsers(
  userIds: string[],
  action: "activate" | "suspend"
): Promise<BulkActionResult> {
  const result: BulkActionResult = {
    success: true,
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const batch = writeBatch(db);

    for (const userId of userIds) {
      try {
        const userRef = doc(db, USERS_COLLECTION, userId);

        if (action === "suspend") {
          batch.update(userRef, {
            isSuspended: true,
            suspendedAt: serverTimestamp(),
          });
        } else if (action === "activate") {
          batch.update(userRef, {
            isSuspended: false,
            suspendedAt: null,
          });
        }

        result.processed++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({ id: userId, error: error.message });
      }
    }

    await batch.commit();

    await logAdminAction(
      "BULK_UPDATE_USERS",
      `Bulk ${action} on ${userIds.length} users. Processed: ${result.processed}, Failed: ${result.failed}`
    );

    return result;
  } catch (error) {
    console.error("Error in bulk update:", error);
    throw error;
  }
}

// Bulk update users role
export async function bulkUpdateUserRole(
  userIds: string[],
  role: UserRole
): Promise<BulkActionResult> {
  const result: BulkActionResult = {
    success: true,
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const batch = writeBatch(db);

    for (const userId of userIds) {
      try {
        const userRef = doc(db, USERS_COLLECTION, userId);
        batch.update(userRef, {
          role,
          updatedAt: serverTimestamp(),
        });
        result.processed++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({ id: userId, error: error.message });
      }
    }

    await batch.commit();

    await logAdminAction(
      "BULK_UPDATE_USER_ROLE",
      `Set role=${role} on ${result.processed} users. Failed: ${result.failed}`
    );

    return result;
  } catch (error) {
    console.error("Error in bulk role update:", error);
    throw error;
  }
}

// Export data
export async function exportData(
  collection: string,
  options: { format: "csv" | "excel"; filters?: Record<string, any> }
): Promise<string> {
  try {
    // This would typically call a Cloud Function to generate and return a download URL
    const functions = await getFunctionsInstance();
    const exportDataFn = httpsCallable(functions, "exportData");
    const result = await exportDataFn({ collection, ...options });
    return (result.data as any).downloadUrl;
  } catch (error) {
    console.error("Error exporting data:", error);
    throw error;
  }
}

// Get admin transactions
export async function getAdminTransactions(filters?: {
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
}): Promise<AdminTransaction[]> {
  try {
    const constraints: QueryConstraint[] = [];

    if (filters?.status && filters.status !== "all") {
      constraints.push(where("status", "==", filters.status));
    }

    constraints.push(orderBy("createdAt", "desc"));
    constraints.push(limit(100));

    const q = query(collection(db, TRANSACTIONS_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    let transactions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data()),
    })) as AdminTransaction[];

    // Date filtering (createdAt is already converted to Date by convertTimestamps)
    if (filters?.dateFrom) {
      transactions = transactions.filter((t) => (t.createdAt as unknown as Date) >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      transactions = transactions.filter((t) => (t.createdAt as unknown as Date) <= filters.dateTo!);
    }

    return transactions;
  } catch (error) {
    console.error("Error fetching transactions:", error);
    throw error;
  }
}

// Get payout requests
export async function getPayoutRequests(status?: string): Promise<PayoutRequest[]> {
  try {
    const constraints: QueryConstraint[] = [];

    if (status && status !== "all") {
      constraints.push(where("status", "==", status));
    }

    constraints.push(orderBy("requestedAt", "desc"));

    const q = query(collection(db, PAYOUTS_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data()),
    })) as PayoutRequest[];
  } catch (error) {
    console.error("Error fetching payout requests:", error);
    throw error;
  }
}

// Process payout
export async function processPayout(
  payoutId: string,
  status: "completed" | "rejected",
  notes?: string
): Promise<void> {
  try {
    const payoutRef = doc(db, PAYOUTS_COLLECTION, payoutId);
    await updateDoc(payoutRef, {
      status,
      processedAt: serverTimestamp(),
      notes,
    });

    await logAdminAction(
      "PROCESS_PAYOUT",
      `Processed payout ${payoutId} as ${status}${notes ? `. Notes: ${notes}` : ""}`
    );
  } catch (error) {
    console.error("Error processing payout:", error);
    throw error;
  }
}

// Log admin action
async function logAdminAction(action: SystemLogAction, details: string): Promise<void> {
  try {
    await addDoc(collection(db, LOGS_COLLECTION), {
      action,
      details,
      severity: "info",
      by: auth.currentUser?.uid ?? null,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error logging admin action:", error);
  }
}
