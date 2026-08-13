# Service Taxonomy — Cutover Design Spec (phase 3)

**Date:** 2026-08-13
**Status:** Approved (design)
**Author:** Hidran Arias (with Claude Code)
**Depends on:** `2026-08-13-service-taxonomy-design.md` (phases 1–2 applied, backfill report reviewed)

## 1. Summary

Phases 1–2 build the catalogue and map the existing data onto it without changing anything a
client sees. This phase switches every consumer over to category ids and deletes the three
systems the catalogue replaces.

**Do not start this phase until the phase-2 backfill report has been read and its unmapped
entries resolved.** This is the deploy where a mapping mistake becomes visible to clients.

## 2. Services carry a category

`InstructorService.categoryId` becomes **required**, and the Add/Edit modal on
`/provider/services` gains a category picker over the active leaves, grouped by their parent.

The picker has **no default**. A silent default is how a catalogue ends up with every service
tagged "Personal Training".

This is the field dropped from the service card in `2026-08-10-trainer-services-design.md` §5.
It returns as *data*; the card stays as it is.

## 3. Specialties become derived

`onProviderServiceWrite` already re-reads a provider's whole services subcollection to
recompute `lowestPrice`, so deriving categories there is nearly free. It additionally writes
`instructors/{uid}.categoryIds` — the distinct categories of the provider's **active**
services, expanded to include ancestors.

Consequently a provider stops declaring what they do and simply offers it. Deleted:

- `SpecialtiesSelector` from `/profile`
- `AVAILABLE_SPECIALTIES` from `src/app/(main)/profile/page.tsx`
- `AVAILABLE_SPECIALTIES` from `src/app/(main)/profile/edit/page.tsx`
- `src/components/profile/SpecialtiesSelector.tsx` and its barrel export
- `userTypeForSpecialty()` from `functions/src/ai/catalog.ts` and its use in
  `migrateInstructors.ts` — it exists only to bridge two taxonomies that are now one

`specialties` stays on the documents, read-only, for one release as a fallback; a follow-up
removes it.

## 4. Search filters by id

| File | Change |
|---|---|
| `src/lib/firebase/providers.ts` | `where('categoryIds', 'array-contains', categoryId)` replaces `specialties.includes(name)` |
| `src/app/(main)/booking/page.tsx` | Chips pass `cat.id`; groups browsable, leaves filterable |
| `src/stores/bookingStore.ts` | `searchFilters.category` carries an id |

Renaming or translating a category stops being a data-integrity event.

## 5. Onboarding templates

On provider approval, seed their service list from `userTypes.services[]` for their
profession — name, `durationOptions[0]`, `pricingType`, and a mapped `categoryId` — as
**inactive drafts**. They set prices and activate.

This answers the complaint that started the whole sequence: the trainer did not merely lack a
save button, they landed on an empty page with no model of what a service should look like.

`userTypes.services[]` has admin CRUD already and is currently read by nothing.

## 6. What `userTypes` becomes

It keeps the two things a profession is genuinely the right home for:

- `requirements` — certifications, licence, insurance, background check, used for verification
- `services[]` — onboarding templates, now wired up

Its own `category` field becomes redundant once categories carry `sections`. It stays on the
document, unread, rather than being deleted in the same pass that rewires everything around
it.

## 7. Testing

| Level | Coverage |
|---|---|
| Unit | Trigger derives `categoryIds` from active services only, includes ancestors, and empties when the last active service is deactivated |
| Unit | Template seeding maps a profession's services to categories and marks them inactive |
| Rules | A provider may write their own services; category ids are not privileged |
| Playwright | Add a service with a category as a trainer; find them via the category chip on `/booking`; **rename the category in `/admin/services` and confirm they are still found** — the exact failure today; deactivate the service and confirm they drop out |

## 8. Risks

| Risk | Mitigation |
|---|---|
| A provider unmapped in phase 2 becomes unfindable | Phase 3 is gated on the phase-2 report being clean |
| Required `categoryId` breaks an existing service form | Backfill runs first, so every existing service already has one |
| Derived specialties differ from what a provider had declared | Intended — the declared list was never what search used; the report surfaces differences before cutover |

## 9. Definition of done

- Every service has a category; the picker offers active leaves grouped by parent.
- Search, chips and filters operate on ids at any depth of the tree.
- Renaming a category does not change who is findable.
- New providers land on a pre-populated draft service list.
- The three replaced systems no longer exist in the codebase.
- Five locales complete; build and tests green.
