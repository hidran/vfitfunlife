# Service Taxonomy — Design Spec (phases 1–2)

**Date:** 2026-08-13
**Status:** Approved (design)
**Author:** Hidran Arias (with Claude Code)
**Cutover:** see `2026-08-13-service-taxonomy-cutover-design.md`

## 1. Summary

Four overlapping systems currently classify what a provider does. This spec replaces them
with one two-level catalogue, referenced by id, and migrates the existing data onto it.

## 2. What exists today

| System | Values | Read by |
|---|---|---|
| `userTypes` (Firestore, `/admin/user-types`) | 10 professions, each with a `category`, `services[]` templates, `requirements`, `tags` | AI search only |
| `serviceCategories` (Firestore, `/admin/services`) | 6 | booking chips, signup opt-in, become-provider card |
| `AVAILABLE_SPECIALTIES` (hardcoded in `profile/page.tsx` **and** `profile/edit/page.tsx`) | 18 | profile specialties selector |
| `userTypeForSpecialty()` (string heuristic) | derives one from the other | instructor migration |

Three defects follow from the split:

- **The join key is a display name.** `fetchProviders` filters `p.specialties.includes(opts.specialty)`
  and `booking/page.tsx:153` passes `cat.name`. Renaming a category in the admin UI orphans
  every provider carrying the old string.
- **`userTypeForSpecialty()` invents ids** — it returns `pilates_instructor` and
  `dance_instructor`, neither of which has a `userTypes` document.
- **`userTypes.services[]` is service-template content that nothing reads**, the same
  built-and-unwired pattern as the dead Feature Flags panel.

Labels are Italian in every locale, because an admin-created document cannot reference a
compile-time i18n key.

## 3. Production reality

A 100-document sample of `instructors` uses 16 distinct specialty strings:

```
Personal Training 22 · Boxe 30 · Cardio 31 · CrossFit 27 · Yoga 11 · Nutrizione 13
HIIT 11 · Pilates 9 · Strength Training 7 · Functional Training 17 · Fisioterapia 20
Yoga Therapy 7 · Psicologia 7 · Massaggio 6 · Mental Coaching 5 · Osteopatia 4
```

**`Yoga Therapy`, `Psicologia` and `Osteopatia` appear in no list in the codebase** — they
came from seed data. Any migration that maps only the known 18 would silently strand 18
providers.

`userType` is `personal_trainer` (72), `massage_therapist` (20), absent (8). No instructor
service carries a category; services are free-text ("Pacchetto 8 lezioni boxe") under
providers whose specialty is "Boxe", which makes the provider's specialty a usable backfill
signal.

## 4. Decisions

1. **Activity-first, one taxonomy.** `serviceCategories` is it. Every service picks one
   category; a provider's specialties are derived from their services. This is the Fresha /
   Booksy / Treatwell shape and the one the platform actually asks of providers.
2. **Two levels**, self-referencing via `parentId`. Designed for a national, three-vertical
   marketplace rather than one city; the admin hides what a given market does not need.
3. **Promote every value**, including the three seed-only ones. Collapsing a CrossFit coach
   and a swimming instructor into "Personal Training" destroys meaning.
4. **`userTypes` keeps requirements and templates**, and stops being a classification axis.

## 5. The catalogue

```ts
interface ServiceCategoryDoc {
  parentId: string | null;              // null = top-level group
  names: Record<Locale, string>;        // it, en, es, fr, de
  icon: string;
  sections: Section[];                  // 'fit' | 'fun' | 'life' — may be several
  order: number;
  isActive: boolean;
}
```

**Only leaves are selectable on a service.** Groups exist for browsing and filtering, so a
provider cannot tag a service "Combat" when they mean kickboxing.

`sections` is an array, not a single value. Nutrizione is legitimately fitness *and*
wellness, and a single value would force a false choice. It also avoids a regression: if
categories were single-section and search filtered by visible sections, tagging Massaggio /
Nutrizione / Fisioterapia as `life` would remove them from search the moment pilot mode is
on. Everything currently live carries `fit` at minimum.

Labels are a per-locale map because the catalogue is admin-authored.

### Launch tree — 8 groups, 21 leaves

| Group | sections | Leaves |
|---|---|---|
| Strength & Conditioning | fit | Personal Training, HIIT, CrossFit, Strength Training, Functional Training |
| Cardio & Endurance | fit | Cardio, Spinning, Nuoto |
| Combat | fit | Boxe, Arti Marziali |
| Mind–Body | fit, life | Yoga, Pilates, Yoga Therapy |
| Dance & Group | fit | Danza, Group Fitness |
| Therapy & Recovery | life | Fisioterapia, Osteopatia, Massaggio |
| Nutrition | fit, life | Nutrizione |
| Mental Wellness | life | Psicologia, Mental Coaching |

Five leaves have no providers (Group Fitness, Danza, Arti Marziali, Nuoto, Spinning). They
ship active: deactivating an empty category later is trivial, a missing one blocks a
provider at signup. VFun ships with no group — the structure is ready when events, parties
and VR need it.

## 6. Ancestry is denormalized

`instructors/{uid}.categoryIds` holds **the leaf and every ancestor**: a boxing trainer gets
`['boxe', 'combat']`. The same goes on the service document.

This is what lets a single `array-contains` serve a filter at any depth. Expanding a group
into its leaves at query time would hit `array-contains-any`'s 30-value ceiling precisely
when the catalogue grows, which is the case being designed for.

Requires a composite index (`providerProfile.isVerified` ASC + `categoryIds` ARRAY_CONTAINS),
added in phase 1 so it is built before anything queries it.

## 7. Hiding and merging

`isActive` on both levels. Deactivating a group hides its subtree from client-facing
surfaces but **never rewrites the children's own flags**, so re-activating restores exactly
what was there. Providers already attached to a hidden category keep the assignment; it
simply stops being offered or filterable. Nothing is deleted, so hiding is reversible.

The admin UI also gets **merge** — reassign a category's providers and services to another,
then deactivate the source. A catalogue this size needs an owner, and without merge, admins
create near-duplicates that nobody can subsequently fix.

## 8. Phase 1 — additive

| File | Responsibility |
|---|---|
| `src/types/serviceCategory.ts` | **Create.** Document and tree types |
| `src/lib/serviceCategories.ts` | **Rewrite.** Bundled fallback becomes the launch tree |
| `src/lib/firebase/serviceCategories.ts` | **Modify.** Read `parentId` / `sections` / `names`; expose the tree |
| `src/hooks/useServiceCategories.ts` | **Modify.** Locale-aware labels, groups and leaves |
| `functions/src/categories/seedCategories.ts` | **Create.** Superadmin callable seeding the tree, idempotent |
| `firestore.rules` | **Modify.** `serviceCategories`: public read, admin write |
| `firestore.indexes.json` | **Modify.** Composite index above |
| `src/types/instructor.ts` | **Modify.** `InstructorService.categoryId?`, `Provider.categoryIds?` — optional in this phase |

Nothing reads the new fields yet; nothing breaks.

## 9. Phase 2 — backfill, report-first

`functions/src/categories/backfillCategories.ts`, superadmin-only, `dryRun` by default.

Resolution order per service:

1. The provider's specialty strings, matched exactly against category names (which is why
   promoting every value matters — every string in production resolves).
2. Keyword match against the service name.
3. Otherwise **null, and listed in the report** — never guessed.

The same pass writes `categoryIds` (with ancestry) onto instructors. The report names every
unmapped service and provider so a human decides before anything client-facing changes.

## 10. Testing

| Level | Coverage |
|---|---|
| Unit | Name→category resolver, including the three seed-only values, case/accent folding, and the unmapped case |
| Unit | Ancestry expansion: leaf yields leaf+ancestors; a group yields itself |
| Rules | `serviceCategories` is publicly readable, admin-writable, not client-writable |
| Manual | Seed callable is idempotent; backfill dry run produces a report without writing |

## 11. Risks

| Risk | Mitigation |
|---|---|
| A mis-mapped provider vanishes from a filter they used to appear in | Phase 2 is report-first and dry-run by default; search does not switch over until phase 3 |
| Composite index missing when search flips | Index ships in phase 1, one deploy earlier than the query that needs it |
| Catalogue rot as it grows | Merge and deactivate are first-class admin operations, not just create/edit |
| Hidden group strands its children | Deactivating a group never mutates child flags; re-activation is exact |

## 12. Definition of done (phases 1–2)

- The tree exists in Firestore, seeded idempotently, admin-editable with localized labels.
- Composite index built.
- Backfill produces a full report in dry-run mode without writing.
- No client-facing behaviour has changed yet.
