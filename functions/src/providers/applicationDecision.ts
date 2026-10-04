import { SERVICE_CATEGORY_TREE, buildLabelIndex, foldLabel, withAncestors } from "../categories/tree";
import { normalizeAvailability } from "../ai/search/normalize";
import { DEFAULT_WEEKLY_HOURS } from "../availability/slots";
import type { BusinessDetails } from "./businessTypes";
import { buildBusinessInstructorPatch } from "./businessApplication";

/**
 * Pure pieces of approving a self-registered provider, kept free of firebase-admin so they
 * can be tested directly (see deriveCategories.ts for the same split).
 *
 * A self-registered applicant used to be approved by a client batch that only flipped
 * providerStatus. They kept role 'customer', got no services, and the categories they
 * picked stayed display names in a field nothing reads — so the professional tab vanished
 * on approval and the provider appeared in no category. Approval now converges them on the
 * same shape as an admin-created provider: role 'provider', and one draft service per
 * requested category, from which onProviderServiceWrite derives categoryIds once active.
 */

export interface DraftService {
  /** Deterministic, so a re-run can never create a second draft for the same category. */
  id: string;
  data: {
    name: string;
    description: string;
    durationMinutes: number;
    price: number;
    isActive: boolean;
    categoryId: string;
    categoryIds: string[];
  };
}

type Locale = keyof (typeof SERVICE_CATEGORY_TREE)[string]["names"];

/**
 * One inactive, unpriced draft per requested leaf category. Inactive and price 0 for the
 * same reason as the template seeding: a service the provider has not priced must never
 * be bookable. Groups are skipped — a service may only sit on a leaf.
 */
export function draftServicesForCategories(categoryIds: string[], locale: string): DraftService[] {
  const drafts: DraftService[] = [];
  const seen = new Set<string>();
  for (const id of categoryIds) {
    const category = SERVICE_CATEGORY_TREE[id];
    if (!category || category.parentId === null || seen.has(id)) continue;
    seen.add(id);
    const name = category.names[locale as Locale] ?? category.names.it;
    drafts.push({
      id: `requested-${id}`,
      data: {
        name,
        description: "",
        durationMinutes: 60,
        price: 0,
        isActive: false,
        categoryId: id,
        categoryIds: withAncestors(id),
      },
    });
  }
  return drafts;
}

/**
 * Resolve legacy `specialties` display names (any locale) to leaf ids, for migrating
 * applicants who registered before categories were stored by id. A name that resolves to a
 * group is reported as unmapped: there is no single service to seed for it.
 */
export function resolveLegacySpecialties(names: string[]): { leafIds: string[]; unmapped: string[] } {
  const index = buildLabelIndex();
  const leafIds: string[] = [];
  const unmapped: string[] = [];
  for (const name of names) {
    const id = index.get(foldLabel(name));
    if (!id || SERVICE_CATEGORY_TREE[id]?.parentId === null) {
      unmapped.push(name);
    } else if (!leafIds.includes(id)) {
      leafIds.push(id);
    }
  }
  return { leafIds, unmapped };
}

/**
 * Every real provider gets bookable hours from day one: Mon–Fri 09:00–17:00
 * (DEFAULT_WEEKLY_HOURS in functions/src/availability/slots.ts) until they visit
 * /provider/availability themselves. True only when the instructor doc has no usable
 * schedule at all — never overwrites hours the provider (or an earlier run) already set.
 */
export function needsDefaultHours(instructor: Record<string, unknown> | undefined): boolean {
  return normalizeAvailability(instructor?.availabilitySchedule).length === 0;
}

/**
 * The role change that makes an approved applicant a provider. Their existing permissions
 * are kept and the provider defaults added: createBooking checks `bookings:write`, and a
 * trainer who books a massage is still a customer. Staff and existing providers keep their
 * role — approval must never demote an admin.
 */
export function providerRolePatch(
  role: string | undefined,
  permissions: string[] | undefined,
  providerDefaults: string[],
): { role: "provider"; permissions: string[] } | null {
  if (role === "provider" || role === "admin" || role === "superadmin") return null;
  return {
    role: "provider",
    permissions: [...new Set([...(permissions ?? []), ...providerDefaults])],
  };
}

/**
 * The verification fields written onto `instructors/{uid}` when a decision is made.
 *
 * Kept as its own function for one reason: this patch is applied with
 * `set(..., { merge: true })`, and merge does NOT resolve dotted field paths. Writing
 * `"providerProfile.isVerified"` there creates a top-level field whose *name* contains a
 * dot and leaves the real nested flag untouched — which silently un-approves the provider,
 * because `firestore.rules` gates the public read of `instructors/{id}` on the nested
 * value. Returning a nested map keeps merge's recursive behaviour, so `bio`, `rating` and
 * `reviewCount` survive while only `isVerified` changes.
 */
export function instructorVerificationPatch(verified: boolean): {
  providerProfile: { isVerified: boolean };
} {
  return { providerProfile: { isVerified: verified } };
}

/**
 * The two writes that queue an application for review (applyAsProvider's pending branch).
 *
 * Same instructors shape an approval produces, minus everything that would make the applicant
 * visible: unverified, pending, and no default hours or draft services — those are seeded by
 * the decision, so a rejected applicant never accumulates them.
 *
 * A business additionally gets its `business` map (nested — the instructors write is
 * set(merge)), its public name as `name`/`fullName`, and `providerType: 'business'` on the
 * user. An individual gets no `providerType` at all: absent already means individual.
 */
export function pendingApplicationPatches<Now>(opts: {
  uid: string;
  applicantName: string | null;
  requestedLeaves: string[];
  /** FieldValue.serverTimestamp() in production; only passed through. */
  now: Now;
  business?: BusinessDetails | null;
}): {
  instructor: Record<string, unknown>;
  user: { providerStatus: "pending"; providerType?: "business"; updatedAt: Now };
} {
  const { uid, applicantName, requestedLeaves, now, business } = opts;
  return {
    instructor: {
      uid,
      name: applicantName,
      fullName: applicantName,
      isActive: true,
      requestedCategoryIds: requestedLeaves,
      providerProfile: { isVerified: false, bio: "", rating: 0, reviewCount: 0 },
      applicationStatus: "pending",
      createdAt: now,
      updatedAt: now,
      ...(business ? buildBusinessInstructorPatch(business) : {}),
    },
    user: {
      providerStatus: "pending",
      ...(business ? { providerType: "business" } : {}),
      updatedAt: now,
    },
  };
}

/** The company's public name, when the instructors doc belongs to a business. */
function businessDisplayName(instructor: Record<string, unknown>): string | null {
  const business = instructor.business;
  if (!business || typeof business !== "object") return null;
  const name = (business as Record<string, unknown>).displayName;
  return typeof name === "string" && name.trim() ? name : null;
}

/**
 * The `instructors/{uid}` write of a verification decision (commitProviderDecision), applied
 * with set(..., { merge: true }) — so nested maps only, never dotted keys.
 *
 * - `application` is present only on the self-apply (auto-approve) path: it stores the
 *   requested leaves and names the provider after the applicant.
 * - A business keeps its name: when the doc carries `business.displayName`, `name`/`fullName`
 *   are never replaced by an applicant's or the user's name. `business` itself is never part
 *   of this patch, so merge leaves it exactly as it is on approval and rejection alike.
 * - A provider with no instructors doc (admin-created, or predating the catalogue) gets one.
 * - Approval seeds Mon–Fri 09:00–17:00 hours when they have none (never over existing hours).
 */
export function decisionInstructorPatch(opts: {
  providerId: string;
  decision: "verified" | "rejected";
  instructorExists: boolean;
  /** The instructors doc as read ({} when it does not exist). */
  instructor: Record<string, unknown>;
  userFullName: unknown;
  application?: { requestedCategoryIds: string[]; fullName?: string | null };
  requestedLeaves: string[];
  /** FieldValue.serverTimestamp() in production; only passed through. */
  now: unknown;
}): Record<string, unknown> {
  const { providerId, decision, instructorExists, instructor, userFullName, application, requestedLeaves, now } =
    opts;
  const verified = decision === "verified";

  const patch: Record<string, unknown> = {
    applicationStatus: decision,
    ...instructorVerificationPatch(verified),
    updatedAt: now,
  };

  if (application) {
    patch.requestedCategoryIds = requestedLeaves;
    if (application.fullName && !businessDisplayName(instructor)) {
      patch.name = application.fullName;
      patch.fullName = application.fullName;
    }
  }

  if (!instructorExists) {
    patch.uid = providerId;
    patch.fullName = application?.fullName ?? userFullName ?? null;
    patch.isActive = true;
    patch.createdAt = now;
  }
  if (verified && needsDefaultHours(instructor)) {
    patch.availabilitySchedule = DEFAULT_WEEKLY_HOURS;
  }
  return patch;
}
