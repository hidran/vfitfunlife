import { getFirestore } from "firebase-admin/firestore";
import { buildLabelIndex, foldLabel, withAncestors } from "../categories/tree";

interface UserTypeServiceTemplate {
  id?: string;
  name?: string;
  description?: string;
  durationOptions?: number[];
  pricingType?: string;
}

/**
 * Seed a newly approved provider's service list from their profession's templates.
 *
 * `userTypes.services[]` has had admin CRUD and real content since January and was read by
 * nothing. This wires it up, which answers the complaint that started this whole sequence:
 * the trainer did not merely lack a save button, they landed on an empty page with no
 * model of what a service should look like.
 *
 * Drafts are written INACTIVE with price 0 — a service the provider has not priced must
 * never be bookable. They set prices and activate.
 *
 * Never overwrites: if the provider already has services, this does nothing. Approval can
 * be re-run, and a second run must not resurrect drafts someone deliberately deleted.
 *
 * Failures are swallowed and logged. Seeding convenience content must not fail a
 * verification.
 *
 * Spec: docs/superpowers/specs/2026-08-13-service-taxonomy-cutover-design.md §5
 */
export async function seedProviderServicesFromTemplates(
  providerId: string,
  userType: string | undefined,
): Promise<{ seeded: number; reason?: string }> {
  if (!userType) return { seeded: 0, reason: "no userType" };

  try {
    const db = getFirestore();
    const servicesRef = db.collection("instructors").doc(providerId).collection("services");

    const existing = await servicesRef.limit(1).get();
    if (!existing.empty) return { seeded: 0, reason: "already has services" };

    const typeSnap = await db.collection("userTypes").doc(userType).get();
    const templates = (typeSnap.data()?.services ?? []) as UserTypeServiceTemplate[];
    if (!Array.isArray(templates) || templates.length === 0) {
      return { seeded: 0, reason: "no templates" };
    }

    const labelIndex = buildLabelIndex();
    // The profession's own name is the best category hint available: a yoga_teacher's
    // "Lezione Privata" carries nothing category-shaped in its own title.
    const typeName = (typeSnap.data()?.name as string) ?? "";
    const fallbackCategory =
      labelIndex.get(foldLabel(typeName)) ??
      labelIndex.get(foldLabel(userType.replace(/_/g, " "))) ??
      null;

    const batch = db.batch();
    let seeded = 0;

    for (const tpl of templates) {
      if (!tpl.name) continue;
      const categoryId = labelIndex.get(foldLabel(tpl.name)) ?? fallbackCategory;
      if (!categoryId) continue; // categoryId is required; a draft without one is unusable

      const ref = tpl.id ? servicesRef.doc(tpl.id) : servicesRef.doc();
      batch.set(ref, {
        name: tpl.name,
        description: tpl.description ?? "",
        durationMinutes: tpl.durationOptions?.[0] ?? 60,
        price: 0,
        isActive: false,
        categoryId,
        categoryIds: withAncestors(categoryId),
      });
      seeded++;
    }

    if (seeded === 0) return { seeded: 0, reason: "no template mapped to a category" };
    await batch.commit();
    return { seeded };
  } catch (err) {
    console.error("[seedProviderServices]", providerId, err);
    return { seeded: 0, reason: "error" };
  }
}
