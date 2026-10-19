# Business accounts: reconciliation of `feat/business-accounts` and `main`

**Date:** 2026-10-19 · **Status:** analysis only (nothing merged, deployed or written to any Firebase project)
**Plan:** `docs/plans/2026-10-04-business-accounts-plan.md` · **Consumer:** `docs/superpowers/specs/2026-10-19-unified-group-courses-design.md` §3 (B12)

| Side | Ref | What it is |
|---|---|---|
| Branch | `feat/business-accounts` @ `877b04c` | 25 commits from `4fff23e` (2026-10-04..06, Codex), 157 files, +14 219/-382. B1-B11 plus B3b (legal form, affiliation number), B8a/B8b (admin callables, review snapshot), two adversarial backend reviews, staging browser verification. **Deployed to production 2026-10-06** (`docs/reports/2026-10-06-business-production-release.md`: rules, indexes, 11 functions, hosting; 102 `providerKind` backfills). |
| Main | `main` @ `1fa024b` | `32ffc26` (uncommitted-work snapshot: courses, participants, partner-gym timetable) plus 45 commits (`556222f` plan amendments, `e308d61` B1 .. `1fa024b`) that rebuild business accounts from the original plan text and add B12. 190 files vs the snapshot. **Deployed to staging only** (`vfit-app-staging`). |

## 0. Conclusion

1. **Take the branch as the base for everything business-related** (server logic, rules, admin callables, admin UI, indexes, signup and profile UI). It is production-deployed, it implements the plan's later amendments (association tax ids, `legalForm`/`affiliationNumber`, approve-what-you-saw, convert, tax-id correction, claim cascade on user deletion), and its transactional `commitProviderDecision` closes races the main rebuild still has.
2. **Port from main only what the branch lacks:** B12 (venue on approval + location/name mirror), `school`/`studio` venue types with `hostsCourses`, `/fit/gyms` listing of all three types, the individual-path review-bypass fixes in `applyAsProvider`, social-link and header/tab hardening, and the booking-page Company badge. About 3 000 lines of main's 9 900 are worth carrying; the rest duplicates the branch.
3. **Procedure:** `reconcile/business-accounts` from `32ffc26`, `git merge feat/business-accounts` (only **6** conflicting files, all trivial; trial merge type-checks and passes 1 131 web tests and 420 provider/user function tests), then hand-port the delta as reviewable commits, restore main-only docs, then `git merge -s ours main` and fast-forward `main`. **Do not `git merge main` into the reconciled branch**: a dry run conflicts in **57** files.
4. **Biggest traps** (each demonstrated by reading or by a trial build, see §1.9 and §6): the branch's rules `hasOnly(businessKeys())` would lock every company owner out of editing as soon as `venueType/address/venueId` exist in the map (staging data already has them); the branch's `users` create rule rejects main's `ProviderCreateView` (`providerType` key); `releaseBusinessVat` exists on both sides with **different inputs** (`vatNumber` vs `providerId`), so any hosting/functions skew breaks the admin release flow; main's UI cannot see production companies (it keys on `instructors.providerType`, which the branch never writes).

### How this was checked

- Read: both plans and logs, the release report, and the code of `applyAsProvider`, `businessApplication`, `commitDecision`, `applicationDecision`, `businessAdmin(Rules)`, `businessVatClaim`, `businessVenue`, `syncBusinessVenueLocation`, rules diffs, index files, the signup/profile/admin UI, `publicBusiness`, `bookingProvider`, `socialLinks` on both sides.
- Dry run 1: `git merge-tree --write-tree --name-only 32ffc26 feat/business-accounts` (no ref touched) gives the 6 conflicts of §5.
- Dry run 2 (temporary detached worktree, since removed): resolved those 6 files, then `tsc --noEmit` on web and functions (clean), `vitest run` on web (158 files / 1 131 tests pass; the bare snapshot passes 139 files / 861 tests) and `vitest run src/providers src/users` in functions (420 pass). Emulator suites (`functions/test/*-rules.test.ts`, `partnerGyms/integration.test.ts`) were **not** run (they need the Firestore emulator).
- Dry run 3: `git merge-tree` of main onto that result: 57 conflicting files (list in §5.4). Copying main's hostsCourses files onto it showed the exact residual errors (`Venue.type` union in `src/types/firebase.ts`, missing `admin.venues.filter.school/studio` i18n keys, branch `ownerUid` column) and that `functions` compiles untouched; keeping main's `releaseBusinessVat.ts` next to the branch's produces `TS2308 ... already exported a member named 'releaseBusinessVat'`.
- Not verified: production data itself (no Firebase access). Statements about prod rely on the release report and its evidence files.

---

## 1. Data model comparison

Writers: **S** = Admin SDK in a callable/trigger, **O** = owner's browser (Firestore rules), **A** = admin's browser (Firestore rules).

### 1.1 `users/{uid}`

| Field | Branch | Main | Compatibility |
|---|---|---|---|
| `providerType` | `'business'` only, absent for individuals. Writer **S** (`applyAsProvider` pending branch); removed by `convertBusinessToIndividual`. Rules: not on the owner create/update allowlists, **and `isAllowedAdminUserProviderUpdate()` blocks admins and superadmins too**; `users` create refuses any doc containing the key. | `'individual' \| 'business'`; individuals get an explicit `'individual'` (applyAsProvider, `ProviderCreateView`, `scripts/backfill-provider-type.mjs`). Writer **S**, plus an admin client (`ProviderCreateView`). Admins may change it (plan D1). | Branch reads: only `=== 'business'`, so main-written `'individual'` is harmless. Main reads: its admin "Privati" filter is `providerType == 'individual'`, which **matches no production provider** (field absent) until a backfill runs. |
| `providerKind` | `'business' \| 'individual' \| null` (null unless provider/applicant). Derived by `onUserWriteAdminIndex` (`functions/src/users/adminIndex.ts` + byte-identical `src/lib/admin/adminIndex.ts`). Writer **S**. Backfilled on 102 prod docs 2026-10-06. | not used | Main ignores it; the branch's type filter depends on it. |
| `providerStatus`, `role`, `isVerified`, `providerProfile.isVerified` | as before; admin **clients** can no longer change `providerStatus`/`isVerified`/`providerProfile.isVerified`/`providerType` (verification only through `decideProviderApplication`). | unchanged rules; admins can still write them from the client. | Any main admin code that writes these fields directly would be refused by branch rules. None found in `src/lib/firebase/admin.ts` or the stores (they use the callable); `ProviderCreateView` is the one `providerType` writer (see I-5). |

### 1.2 `instructors/{uid}` and the `business` map

| Field | Branch | Main | Compatibility |
|---|---|---|---|
| `business` (map) | `legalName, vatNumber, legalForm, affiliationNumber, displayName, description, website, logoUrl, city`. Writer **S** at apply; owner (**O**) may change only `displayName, description, website, city, logoUrl` (rules `isValidOwnerBusinessChange`); admin client held to the same checks; presence cannot be added/removed by clients. | `legalName, vatNumber, displayName, description, website, logoUrl, city, venueType, address, venueId`. Writer **S** at apply (`venueId` also **S** at approval); owner allowlist `displayName, description, website, logoUrl, city`; admin client unrestricted. | See I-1 and I-6..I-9. |
| `business.legalForm` (`company\|sole_trader\|association\|other`) | Always written; absent on old docs means `company`. | absent | Branch handles absence (`checkBusinessReview` defaults). Main's admin card never shows it, so an association would be approved without the admin seeing that it is one. |
| `business.affiliationNumber` (string, `""` if none, ≤40) | Always written. | absent | Same. |
| `business.venueType` (`gym\|school\|studio\|none`, default `gym`), `business.address` (string\|null ≤200), `business.venueId` (`biz_<uid>`) | absent | Written. `venueType`/`address` by apply; `venueId` by approval (nested map, never dotted). | **Branch rules reject any owner edit of a map that contains these keys** (I-1). A branch-written pending company approved by main code would get a `gym` venue with an empty address (default `gym`). |
| `business.website` | stored as typed (trimmed, http(s) validated; form prepends `https://`). Cap 200. | stored as `URL.href` (normalised, trailing slash). Cap 300. | Compatible; caps differ (I-9). |
| `business.description` / `city` caps | 1 000 / 80 (server and rules) | 2 000 / 120 (server only; rules have none) | Main-written long values make the branch's edit form fail validation (I-9). |
| `providerType` on the instructors doc | **Never written.** Plan notes the owner can write it; nothing reads it; `convertBusinessToIndividual` deletes it if present. Public "Azienda" badge is derived from a valid `business` map (`src/lib/publicBusiness.ts`). | Written by `applyAsProvider` and `commitProviderDecision` (denormalised); locked for owners (`accountTypeUnchanged`). The badge and `providerImageUrl` key on it. | **I-2:** main's UI shows no badge/logo for any branch-written company. |
| `name` / `fullName` | = `business.displayName` for companies; approval never overwrites it. | same | Same. Both leave `name`/`fullName` owner-writable (plan §B4 "neighbouring holes"). |
| `searchTerms` | adds `business.displayName` + `business.legalName` after specialties/categories. | adds the same, placed before specialties (survives the 300-term cap). | Equivalent; main's ordering is slightly better (N2). |
| `applicationStatus`, `providerProfile.isVerified`, `requestedCategoryIds` | same shapes | same | Compatible. |

### 1.3 `businessVat/{digits}`

| | Branch | Main |
|---|---|---|
| Shape | `{ uid, createdAt }`, id = 11 bare digits | identical |
| Rules | `allow read, write: if false` | identical |
| Created by | `applyAsProvider` business transaction (`claimBusinessVat`): reads users+instructors fresh, queries `businessVat where uid == caller` and **deletes every other claim the caller holds**, refuses another uid's claim (`vat_already_registered`), refuses an approved business (`business_already_approved`) | `queueBusinessApplication` transaction (`claimVat`): releases `previousVat` taken from the stored `instructors.business.vatNumber` only; refuses another uid's claim (`business_vat_taken`) |
| Required at approval | **Yes** (`claim_missing` / `vat_already_registered`, same transaction) | No |
| Released by | `releaseBusinessVat({vatNumber})` (only when the holder is rejected or unlisted: `claim_in_use`), `convertBusinessToIndividual`, `updateBusinessTaxId`, and **`deleteUserCascade`** | `releaseBusinessVat({providerId})`, unconditional (also for an approved, listed company) |

Same data, different guarantees. Claims written by either side are readable by the other. Main leaves orphan claims when a user is deleted, and cannot free them (its release needs the deleted user's instructors doc: `Provider not found`).

### 1.4 `venues/{id}`

| | Branch | Main |
|---|---|---|
| Created for a company | never | `venues/biz_<uid>` on approval (`batch.create`, so a clash fails the whole decision with `venue_exists`): `name, slug, type (gym\|school\|studio), city, address (string), lat/lng if the provider already saved a valid location, ownerId, partnerStatus 'pending', isPartner false, isActive true, memberDiscountPercent 0, partnerInstructorExtraPercent 0, rating 0, reviewCount 0, description, heroGradients, amenities [], hours [], photoUrls [], createdAt, updatedAt` (pure `functions/src/providers/businessVenue.ts`) |
| Mirror | none | `syncBusinessVenueLocation` (`instructors/{id}` write trigger, `retry: true`): copies lat/lng/city and `business.displayName` to `venues/{business.venueId}` with `update()` (never `set`) |
| Owner field | adds `Venue.ownerUid?` (type and admin "Owner" column, always empty) | uses `ownerId` (what the snapshot's `partnerGyms/store.ts` and `managesGym` rule already use); Owner column links to the provider |
| `VenueType` | unchanged: 5-value union in `firebase.ts`, 4-value in `venue.ts` | 8-value canonical union, `COURSE_VENUE_TYPES = ['gym','school','studio']`, `hostsCourses()` in both trees; `activePartnerGym` rule uses `in ['gym','school','studio']` |

The branch's `ownerUid` is wrong for this codebase (spec amendment B8 already says `ownerId`); in the trial merge `Venue` ends up with both fields and the branch's Owner column reads the dead one.

### 1.5 Derived/admin and audit fields

| | Branch | Main |
|---|---|---|
| Admin list filter | `providerKind ==` (+4 composite indexes, in prod) | `providerType ==` (+4 composite indexes, staging only) |
| Audit entity types | adds `business_vat` (`functions/src/lib/auditEntityTypes.ts`, `src/types/audit.ts`) for release | none; release is logged as `provider`/`update` |
| Business audit entries | approval, release, convert, tax-id change, all written in the same transaction | approval (existing), release (same transaction) |

### 1.6 Callables

| Callable | Branch (prod) | Main (staging) |
|---|---|---|
| `applyAsProvider` | in: `{categoryIds, fullName?, providerType?, business?{legalName, vatNumber, legalForm?, affiliationNumber?, displayName?, description?, website?, city?}}`. out: `{success, providerId, autoApproved, draftServicesSeeded}` (no `status`; client uses `applicationOutcomeStatus(autoApproved)`). Business is always pending. | in: same without `legalForm/affiliationNumber`, plus `business.venueType?`, `business.address?`. out adds `status: 'verified'\|'pending'`. A verified account re-applying is a no-op. |
| `decideProviderApplication` | in adds `expectedReview?{vatNumber, legalName, legalForm?, affiliationNumber?}`; **required to approve a company**. out: `{success, providerId, decision, draftServicesSeeded}`. | in unchanged. out adds `venueId`. |
| `releaseBusinessVat` | in `{vatNumber, reason?}`; out `{success, vatNumber, releasedFrom}` | in `{providerId, reason?}`; out `{success, providerId, vatNumber, released}` |
| `convertBusinessToIndividual` | `{providerId, reason?}` | does not exist |
| `updateBusinessTaxId` | `{providerId, vatNumber, legalName?, legalForm?, affiliationNumber?, reason?}` | does not exist |
| `verifyProvider` (legacy) | refuses companies (`use_decide_provider_application`), one transaction | unchanged (can still verify a company without review) |
| `syncBusinessVenueLocation` (trigger) | n/a | present |

### 1.7 Error codes (HttpsError message)

| Meaning | Branch | Main |
|---|---|---|
| bad provider type | `invalid_provider_type` | `provider_type_invalid` |
| business payload missing/not an object | `invalid_business` | `business_required` |
| bad tax id | `invalid_vat` | `business_vat_invalid` |
| legal/display name | `invalid_business_name` | `business_legal_name_required`, `_too_long`, `business_display_name_required`, `_too_long` |
| description / city / website | `invalid_business_description`, `invalid_business_city`, `invalid_website` | `business_description_invalid/_too_long`, `business_city_invalid/_too_long`, `business_website_invalid/_too_long` |
| legal form / affiliation | `invalid_legal_form`, `invalid_affiliation_number` | n/a |
| address / venue type | n/a | `business_address_invalid/_too_long`, `business_venue_type_invalid` |
| tax id already claimed | `vat_already_registered` (`already-exists`) | `business_vat_taken` (`already-exists`) |
| company re-applying as individual | `business_account_exists` | `provider_type_locked` |
| approved company re-applying | `business_already_approved` | silent no-op |
| verified individual becomes company | allowed (drops to pending) | `provider_type_locked` |
| review snapshot | `review_required`, `stale_review`, `claim_missing`, `claim_in_use`, `claim_not_found`, `not_a_business`, `vat_carried_by_other`, `vat_change_not_allowed`, `protected_account`, `provider_not_found`, `invalid_provider_id`, `invalid_reason`, `use_decide_provider_application`, `concurrent_update` | `business_vat_missing`, `venue_exists` |

The web mapping tables (`src/lib/providerApplicationErrors.ts` on the branch; `useBusinessDetails`/`providerApplicationErrorFor` on main) are keyed on these strings and are **not interchangeable**.

### 1.8 Rules and indexes

| Area | Branch | Main |
|---|---|---|
| `instructors` create | `!isBusinessUser(id)` and no `business` key, for admins too | no `business`, `providerType` must be individual; admin unrestricted |
| `instructors` update (owner) | `isAllowedOwnerBusinessUpdate`: no add/remove of the map, `hasOnly(9 keys)`, reviewed keys frozen (`legalName, vatNumber, legalForm, affiliationNumber`), value limits on changed fields (`displayName` 1-120, `description` ≤1000, `city` ≤80, `website` null or `^https?://\S+$` ≤200, `logoUrl` null or `^https://\S+$` ≤500) | `accountTypeUnchanged`, allowlist via `diff().affectedKeys().hasOnly([5 keys])`, `businessWebsiteSafe` (changed value only, ≤300) |
| `instructors` update (admin) | same business checks, verification state unchanged | unrestricted |
| `instructors` delete | refused for companies | admin |
| `users` | see 1.1 | unchanged |
| `businessVat` | deny-all | deny-all |
| `activePartnerGym` | `type == 'gym'` | `in ['gym','school','studio']` |
| `socialLinks` (users and instructors) | unconstrained | unconstrained (UI-only mitigation) |
| Composite indexes | 53 (49 + 4 `providerKind`) = exactly what prod has | 62 (58 snapshot + 4 `providerType`) |

Index delta that matters: prod (53) = branch file. The snapshot's 9 course/gym indexes (`courseEnrollments`, `courseRefunds`, `courses`×2, `gymBookings`, `gymSessions`×2, `sessions` collection-group×2) are **not in prod**. The reconciled file is the union: 58 + 4 `providerKind` = **62** (this is what the trial merge produces); main's 4 `providerType` indexes are dropped.

### 1.9 Incompatibility register

Branch-written data read by main's code ("B→M"), and the reverse ("M→B"):

| # | Direction | Incompatibility | Effect | Resolution |
|---|---|---|---|---|
| I-1 | M→B | Branch rules `after.keys().hasOnly(businessKeys())` on the whole resulting `business` map. Main-written maps contain `venueType/address/venueId`. | Owner cannot save any profile/logo/rename edit (permission-denied) for any main-written company (staging today; production after B12). | Port: add the three keys to `businessKeys()` **and** `businessReviewedKeys()` (frozen) in `firestore.rules`; add rules tests. |
| I-2 | B→M | Main's badge/logo/booking UI keys on `instructors.providerType === 'business'` (`providerImageUrl`, `ProviderSearchResult.providerType`, "providerType decides"). The branch never writes it. | No Azienda badge, no logo for any production company in main's UI. | Drop main's `bookingProvider.ts` helpers; port its pages onto the branch's `isBusiness`/`business`/`logoUrl`. |
| I-3 | B→M | Main's admin type filter `providerType == 'individual'` vs production users that have no `providerType`. | "Privati" shows nothing until `scripts/backfill-provider-type.mjs --apply` runs on prod (main's own plan: B11 prerequisite). | Drop main's filter and script; use `providerKind` (already backfilled on prod). |
| I-4 | M→B | Main's 4 `providerType` indexes (staging) vs the branch's `providerKind` indexes (prod). | `firebase deploy --only firestore:indexes` of main's file to prod offers to **delete** the 4 live `providerKind` indexes; the admin filter then fails with a missing index. | Reconciled file = 62 union; never deploy main's file to prod. Remove the 4 orphan `providerType` indexes from staging afterwards. |
| I-5 | M→B | Main's `ProviderCreateView` writes `providerType: 'individual'` into a new `users` doc; branch `users` create rule starts `!('providerType' in request.resource.data)`. | Admin "add provider" fails with permission-denied. | Drop that line (`src/components/admin/providers/ProviderCreateView.tsx`, 2 lines). |
| I-6 | both | `releaseBusinessVat` has the same name, different input (`providerId` vs `vatNumber`) and output. | Hosting from one side against functions from the other: release dialog fails (`providerId is required` / `invalid_vat`). Staging is in exactly this state at times. | One implementation (branch); redeploy hosting and functions together. |
| I-7 | both | `decideProviderApplication`: branch requires `expectedReview` for companies. Main's UI does not send it. | Main hosting + branch functions: every company approval fails `review_required`. Branch hosting + main functions: works (extra field ignored) but unsafe. | Same: deploy both halves together; port keeps the branch's three approve surfaces. |
| I-8 | both | Error code vocabularies differ (§1.7). | Wrong or generic inline errors on signup/admin when halves are mixed. | One vocabulary (branch's); port adds `invalid_venue_type`, `invalid_business_address`, `venue_exists`. |
| I-9 | M→B | Main accepts longer values (`description` 2 000, `city` 120, `website` 300) than the branch's form and rules (1 000 / 80 / 200). | The branch's edit form validates the whole form: a main-written 1 500-character description blocks every save until shortened. | Edge case; either lower main-style limits at the data layer (script) or keep the branch's limits and accept it for synthetic staging data. |
| I-10 | B→M | Main's admin company card does not show `legalForm`/`affiliationNumber`; main approval does not check a snapshot. | Association approved without the admin seeing it is one; admin may approve a different tax id than the one reviewed. | Drop main's card (branch's `BusinessReviewCard` + `BusinessAdminActions`). |
| I-11 | M→B | `releaseBusinessVat` (main) can free an approved company's claim; approval does not need a claim. | A second account can register the same tax id: duplicate listed companies. | Drop main's callable. |
| I-12 | both | Venue owner field `ownerUid` (branch) vs `ownerId` (snapshot, main). | Admin Owner column permanently empty for venues created by B12. | Take main's column (link to provider); delete `Venue.ownerUid` from `src/types/venue.ts` and the branch's list code. |
| I-13 | B→M | `audit_logs.entityType = 'business_vat'` is unknown to main's `AUDIT_ENTITY_TYPES`. | Audit viewer shows an unlabelled entity type (cosmetic). | Comes with the branch. |
| I-14 | M→B | Approved company with a B12 venue is later converted (`convertBusinessToIndividual`) or its user is deleted (`deleteUserCascade`): `venues/biz_<uid>` stays, public on `/fit/gyms` if it has coordinates. | Orphan venue owned by a non-company/deleted user. | Port S-6. |

Production data written by the branch today is, to the best of the release report, **only synthetic** (all test companies and claims were removed on 2026-10-06 and no real company is recorded); the exposure to I-2/I-3 is therefore about future signups and the 102 `providerKind` backfills, not migrations of live companies. Confirm with one read-only count of `businessVat` and `users where providerType == 'business'` on `vfit-funlife` before the production deploy.

---

## 2. Feature matrix

"Better" is a recommendation for the reconciled code.

| # | Capability | Branch | Main | Better / why |
|---|---|---|---|---|
| 1 | P.IVA / tax-id validation | `vatNumber.ts` (functions + web), checksum, strips `IT`; D3 amended: association codice fiscale accepted, UI label "P.IVA / Codice fiscale", `legalForm`, `affiliationNumber` | same checksum logic (rewritten, all-zero check), P.IVA only in copy and plan | **Branch**: identical algorithm, plus the association support the first real prospect (an ASD) needs. Drop main's copies. |
| 2 | Claim uniqueness | transactional, uid-query release of other claims, doc-id safety, approved-business refusal, approval requires the claim, user-deletion cascade, `vat_carried_by_other` for admin moves | transactional claim, `previousVat` from stored map, no approval check, no cascade | **Branch**: closes squatting/orphan cases demonstrated in its lifecycle tests. |
| 3 | Manual approval | always pending (`shouldAutoApprove`), one transaction | always pending | Both; branch's transaction is stronger (4). |
| 4 | Review-bypass protection | company can never be auto-approved; business lock both signals (`users.providerType` or map); `business_already_approved`; `expectedReview`/`stale_review`; approval holds claim; admin clients blocked by rules; legacy `verifyProvider` refuses companies | business lock; `provider_type_locked`; **rejected individual never auto-approves**; **verified account re-apply is a no-op**; verified individual cannot become company | **Branch for companies; main for the individual path.** The branch still auto-approves a *rejected* individual on re-apply with auto-approval ON (`shouldAutoApprove` ignores `applicationStatus`), and, with it OFF, re-queues a *verified* individual (de-listing them). Port S-1. |
| 5 | Signup UI | RHF+Zod `BusinessDetailsForm` (ref API `validate/showServerError`), `ProviderTypeChoice` (native radios in a fieldset), legal form select, affiliation number, website `https://` normalisation, account fields locked after the account step succeeded, retry reuses the created account, `autoApproved`-based screens | controlled-state `useBusinessDetails` + `ProviderTypeToggle` (button radiogroup with roving tabindex/arrows/Home/End added late), `venueType` + `address` fields, retry reuses account | **Branch** base (more fields, native semantics, more tests); port main's venue fields and the `auth-surface select` light-theme CSS. |
| 6 | Profile editing | `BusinessProfileSection` + `updateBusinessDisplayFields`: allowlisted dotted paths, name/fullName mirror, logo https check, page-level Save saves the section first and counts its edits in the unsaved guard, shown to pending companies read-only | same idea (`updateBusinessDetails`), own Save button only; main's log lists the unsaved-guard gap as open | **Branch.** |
| 7 | Public badge and search | `BusinessBadge`; badge derived from a valid `business` map; public subset only (`PublicBusiness`: no legal name/tax id); badge on `/booking` cards and `/providers/detail`; logo in header; search by legal name | badge on `/booking`, provider page, **`/book` header, booking confirm and booking detail**; keyed on `instructors.providerType` | **Branch** model (trustworthy source, production data works); **port main's extra placements** (N-3). |
| 8 | Admin type filter | `providerKind` (derived by trigger, backfilled), filter bar labels tied to selects, URL `?type=` | `providerType ==`, needs prod backfill | **Branch.** |
| 9 | Release claim | by tax id, refuses while holder is live (`claim_in_use`), audited as `business_vat`/`delete`; button only for rejected company | by providerId, unconditional, button for any company with a number | **Branch.** |
| 10 | Convert business ↔ individual | `convertBusinessToIndividual` (admin, audited, releases claim, clears type and map); individual→business via apply (drops to pending) | none (companies locked, "admin job" never built) | **Branch.** Needs venue handling after B12 (S-6). |
| 11 | Tax-id correction | `updateBusinessTaxId` (moves the claim, validates with signup rules, audited) | none; admin can edit the map directly from the client and desynchronise the claim | **Branch.** |
| 12 | Venue on approval (B12) | none | yes, `biz_<uid>`, `batch.create`, idempotent via `business.venueId`, `venue_exists` | **Main only** → MUST port, adapted to the branch's transaction. |
| 13 | School/studio venue types | none | `VenueType` canonical union, `COURSE_VENUE_TYPES`, `hostsCourses` in both trees, rule, partner-gym gates, AI tool enum, `/fit/gyms` `types`, "Palestre e scuole" ×5 | **Main only** → MUST port. Note P2 removes the partner-gym flow, so the `partnerGyms/*` gates are short-lived; the type table and the rule are not. |
| 14 | Website hardening | server: absolute http(s) only; rules: owner and admin, changed value, `^https?://\S+$` ≤200; render: `BusinessWebsiteLink` re-checks scheme, `rel` and sr-only "new tab" | server: http(s) via `URL`, stores `href`; rules: owner only, changed value ≤300; render: `safeHttpUrl` in admin card | **Branch** (stricter, covers admins, public render checked). |
| 15 | Social-link hardening | none: `ProviderProfileClient.tsx` lines 446/457/467 render `socialLinks.website`/`linkedin` raw into `href` and build the Instagram URL by string replace; rules do not constrain `socialLinks` | `socialLinkHref` (http(s) only, bare host → https, `@handle` → profile, **host allowlist per platform** so an "Instagram" pill cannot open another site) + `SocialLinksEditor` | **Main** → SHOULD port. |
| 16 | Accessibility fixes | native radios; form owns deferred focus to first error and `showServerError(code)` focuses the field; permanent sr-only error announcers; `role="alert"` on register error boxes; 44px targets; filter labels tied to selects; tabs wrap | roving-tabindex radiogroup with arrows/Home/End; deferred focus to first bad field; sr-only announcers; `ProviderTypeToggle` banner flag; tab strip scrolls inside itself with focus ring and scroll-into-view | **Both**; branch by construction (native), main's EntityDetailLayout/tab-strip fixes are the more complete ones (S-3). Open on both: required fields lack `aria-required`. |
| 17 | Guides and screenshots | `business-signup(.it).md`, 28 screenshots in `business-screenshots/` + README, production checklist, release report and evidence JSON | `business-signup(.it).md`, 55 screenshots in `screenshots(-it)/`, `business-signup-verification.md` (D1-D16 defect log), staging checklist | Keep the branch guides as base; **restore main's verification log**; re-shoot venue/gym screens on the reconciled build. |
| 18 | Backend test infrastructure | `functions/test/fakes/fakeFirestore.ts` (stateful, re-runs transactions on contention, read-after-write, create-on-existing), 8-sequence lifecycle tests, 38+ emulator rules tests | per-feature mocks, 22 rules tests | **Branch**; port tests must use the fake. |
| 19 | User deletion, audit, legacy callable | `deleteUserCascade` deletes claims; `business_vat` audit entity; `verifyProvider` guard | none | **Branch.** |

---

## 3. Port list (main → reconciled branch)

Sizes are main's diff vs `32ffc26` (lines added). "Adapt to" names the **branch** file that receives the change. All the clean copies apply with `git checkout main -- <path>` and compile; the adapted ones need hand edits.

### MUST (required by the unified-courses spec §3 / B12)

| # | What | Main source | Size | Depends on | Adapt to (branch files) |
|---|---|---|---|---|---|
| M-1 | `VenueType` (8 values), `COURSE_VENUE_TYPES`, `hostsCourses`, `BUSINESS_VENUE_TYPES`; remove main's duplicate `ProviderType`/`BusinessDetails` | `functions/src/types.ts` (+49), `functions/src/types.test.ts`, `src/types/venue.ts` (+26), `src/types/venue.test.ts` | S | none | Clean copy of the venue parts. `functions/src/providers/businessTypes.ts`: add `venueType?: BusinessVenueType`, `address?: string \| null`, `venueId?: string \| null` to `BusinessDetails`. `src/types/firebase.ts`: keep the branch's `BusinessDetails`, add the same three fields and `BusinessVenueType`; set `Venue.type: VenueType` (import from `@/types/venue`); delete `Venue.ownerUid?` in `src/types/venue.ts` (use `ownerId`). |
| M-2 | Course-hosting gates | `functions/src/partnerGyms/schedule.ts`, `store.ts` (+9), `integration.test.ts` (+37), `functions/src/ai/tools/index.ts` (enum), `functions/test/partner-gyms-rules.test.ts` (+14), `firestore.rules` `activePartnerGym` | S | M-1 | No branch overlap; `firestore.rules`: one-line change inside the merged file. |
| M-3 | `/fit/gyms` lists gym+school+studio; venue pages and admin venue forms | `src/lib/firebase/venues.ts` (+29), `src/hooks/useVenues.ts`, `src/app/(main)/fit/gyms/page.tsx`, `src/app/(main)/venue/VenueDetailClient.tsx` (+28/-24), `src/components/admin/venues/VenueFormView.tsx`, `VenueDetailView.tsx`, `VenuesListView.tsx` (+32), tests (+~330) | M | M-1, i18n | Clean copies except `VenuesListView.tsx` (+test): **main wins** (Owner column uses `ownerId` and links to the provider; delete the branch's `ownerUid` column) and keep the branch's sr-only "no owner" text (`admin.venues.owner.none`, N-1). |
| M-4 | Company form carries `venueType` (default `gym`, `none` = no premises) and `address` | `src/lib/businessDetails.ts` (venue parts), `BusinessDetailsForm.tsx` (venue fields), `useBusinessDetails.ts` | M | M-1 | Branch `src/lib/businessDetails.ts` (`BusinessDetailsFormValues`, `businessDetailsSchema` with address required ≤200 and city required when `venueType !== 'none'`, `toBusinessApplication`, `BUSINESS_FIELD_LIMITS.address`, `businessFormValues`), `src/components/provider/BusinessDetailsForm.tsx` (React Hook Form field + `<select>`; edit mode shows type/address read-only), `src/lib/firebase/providerApplication.ts` (`BusinessApplicationInput`), `src/styles/globals.css` (`auth-surface select`, 1 line). |
| M-5 | Server contract for the venue fields | `functions/src/providers/businessApplication.ts` (`validateBusinessApplication` venue part) | S | M-1 | Branch `functions/src/providers/businessApplication.ts` `validateBusinessInput`: parse `venueType` (absent → `gym`, unknown → new `invalid_venue_type`) and `address` (≤200, new `invalid_business_address`); always write both so a pending re-apply replaces them; `businessTypes.ts` as in M-1. Keep `validateBusinessInput` the single validator (`updateBusinessTaxId` reuses its parts). |
| M-6 | Rules: owner may not touch the venue keys | main `businessProtectedUnchanged` idea | S | M-5 | Branch `firestore.rules`: `businessKeys()` += `venueType, address, venueId`; `businessReviewedKeys()` += the same three. Without this, I-1. Add cases to `functions/test/business-rules.test.ts` (owner edit of `displayName` on a map with venue keys passes; owner change of `venueType`/`venueId` denied; admin client denied). |
| M-7 | **Venue on approval** | `functions/src/providers/businessVenue.ts` (176), `businessVenue.test.ts` (194), the venue part of `commitDecision.ts` (+45), `commitDecisionVenue.test.ts` (221), `decideProviderApplication.ts` (+2) | M-L | M-1, M-5 | `businessVenue.ts` clean copy. Branch `functions/src/providers/commitDecision.ts` (transaction): after the reads compute `planBusinessVenue({providerId, instructor, now})` when `verified`; `tx.create(db.collection('venues').doc(plan.venueId), plan.venue)` and `Object.assign(instructorPatch, plan.instructorPatch)` (nested `business.venueId`; the branch's patch has no `business` key, so merge is safe); add `venueId` to the audit `after`; catch gRPC code 6 (`ALREADY_EXISTS`) around `runTransaction` and throw `HttpsError('already-exists','venue_exists')` **before** `toConcurrentUpdateError`; return `{draftServicesSeeded, venueId}`. `decideProviderApplication.ts` returns `venueId`; `src/lib/firebase/functions.ts` result type gains `venueId`. Rewrite the tests on `functions/test/fakes/fakeFirestore.ts` and add to `businessLifecycle.test.ts`: contention re-run creates one venue; `stale_review`/`claim_missing` create none; `none` and individuals create none; two approvals collide on `biz_<uid>`. Side benefit: reading the provider's location inside the transaction closes main's known "location saved between read and commit" gap. |
| M-8 | **Location/name mirror** | `functions/src/providers/syncBusinessVenueLocation.ts` (65), `.test.ts` (136), `businessVenue.ts` helpers `venueLocationPatch`/`venueNamePatch` | S | M-7 | Clean copy; add `export { syncBusinessVenueLocation } from "./providers/syncBusinessVenueLocation";` to `functions/src/index.ts` (branch exports `businessAdmin` there). Needs deploy with `--force` (retry trigger). |
| M-9 | Admin shows the decision outcome | `admin.providerDecision.error.venueExists`, `providerDecisionErrorKey` | S | M-7 | Do not port `providerDecisionError.ts`; add `venue_exists` to `ADMIN_BUSINESS_ERRORS` in `src/lib/providerApplicationErrors.ts` (the branch's three approve surfaces `ProviderDetailView`, `src/app/admin/providers/verifications/page.tsx`, `ProviderApplicationsPanel` already map that table). Show venue type, address and a link to the venue in `BusinessReviewCard.tsx`. |
| M-10 | i18n for all of the above | `fit.gyms.title` ("Palestre e scuole"), `admin.venues.filter.school/studio`, `provider.business.venue.{gym,school,studio,none}`, `provider.business.venueType`, `provider.business.address`, `provider.business.error.addressRequired/venueTypeInvalid`, `admin.providerDetail.business.venueType/venueTypeNone/address`, `admin.providerDecision.error.venueExists` | S | none | `src/i18n/messages/{it,en,es,fr,de}.ts` (about 14 keys × 5). 14 other main keys collide with branch keys (`provider.badge.business`, `provider.business.edit.*`, `provider.business.error.vatInvalid/...`, `admin.venues.col.owner`): keep the branch's. `completeness.test.ts` guards the set. |

### SHOULD (hardening the branch lacks)

| # | What | Main source | Size | Adapt to |
|---|---|---|---|---|
| S-1 | Individual-path bypasses: a **rejected** applicant is queued again even with auto-approval ON; an **already verified** account re-applying is a no-op (nothing rewritten, also legacy docs verified only on the instructors side); a verified individual cannot turn itself into a company (`provider_type_locked`, no UI entry point exists today, and the other direction is the admin's `convertBusinessToIndividual`) | `functions/src/providers/applyAsProvider.ts` (the `wasRejected`, `isVerified`, `asksToChangeType` parts), tests at `applyAsProvider.test.ts` lines 259-320 | S | Branch `applyAsProvider.ts`: compute `rejected`/`verified` from the early reads and pass them to `shouldAutoApprove` (`onboardingSettings.ts`, add an options arg) and a pre-transaction return; re-check `verified` inside the pending transaction (it already re-reads users and instructors). Add `provider_type_locked` to the branch's error vocabulary and `providerApplicationErrors.ts`. Port the tests onto the branch's `fakeFirestore`. Demonstration: main's test "queues a rejected individual on re-apply even with auto-approval on" fails against the branch code. |
| S-2 | Social links | `src/lib/socialLinks.ts` (61) + `.test.ts` (115), `src/components/profile/SocialLinksEditor.tsx` (+35 test) | S | Clean copies. `socialLinks.ts` imports `safeHttpUrl` from `@/lib/businessDetails`: repoint to the branch's `src/lib/publicBusiness.ts` and **replace its weaker `safeHttpUrl` with main's** (returns the normalised `href`, rejects a hostless value). In branch `ProviderProfileClient.tsx` (conflicts with main; take the branch file) replace the three raw `href`s (lines ~446, 457, 467) with main's `SocialPill`/`socialLinkHref`. New work neither side has: constrain `socialLinks.*` in `firestore.rules` for `users` and `instructors` (http(s) or `@handle`, ≤200) with rules tests. |
| S-3 | Admin detail header and tab strip at 320/390 | `EntityDetailLayout.tsx` (`min-w-0`, `break-words`, subtitle `break-all`), `ProviderTabsContent.tsx` (scroll strip, focus-ring padding, scroll-into-view), `ProviderTabBar.test.tsx` | S | Main's versions replace the branch's one-class changes (`break-words` only; main's re-verification showed long emails still overflowed). Re-check at 320/390 on the reconciled build. |
| S-4 | Convert/delete must not orphan the B12 venue | n/a (new) | S | `convertToIndividualPatches` in `functions/src/providers/businessAdminRules.ts` and `convertBusinessToIndividual` in `businessAdmin.ts`: when `business.venueId` exists, set `venues/{id}.isActive=false` (keep `ownerId` for audit) in the same transaction and record it in the audit entry. `deleteUserCascade` (`functions/src/users/deleteUserCascade.ts`): same for `venues where ownerId == uid` with `id == biz_<uid>`. Tests with the fake. |
| S-5 | Name spoofing on a company doc | n/a (branch plan §B4 optional rule) | S | Rules: for docs with a `business` map require `name == fullName == business.displayName` on owner update (B6 already mirrors them). Optional; listed because `name`/`fullName` are owner-writable on both sides. |

### NICE

| # | What | Source | Notes |
|---|---|---|---|
| N-1 | sr-only "no owner" text in the Owner column | branch `VenuesListView` (keys already in the merged i18n) | keep when taking main's column |
| N-2 | Company names indexed before specialties in `searchIndex.ts` | main `computeProviderSearchTerms` (+7) | the 300-term cap truncates from the end |
| N-3 | Company badge/logo on `/book` header, booking confirm, booking detail | `src/app/book/BookingClient.tsx` (+5), `src/app/(main)/booking/confirm/page.tsx`, `src/app/(main)/bookings/[id]/BookingDetailClient.tsx` (+15) and tests | read `isBusiness`/`business.logoUrl` from the branch `Provider` type; main's follow-up (booking detail loses the badge if the instructors doc is not readable) still applies |
| N-4 | `status` in the `applyAsProvider` result | `ApplyAsProviderResult.status` | optional; the branch client derives it from `autoApproved` |
| N-5 | Non-blocking list refresh after a decision | `adminStore.ts` `refreshAfterProviderDecision` (+13) | the branch fixed the stale detail view differently; verify before porting |
| N-6 | Documentation | `docs/deployment/staging.md` (business release checklist), `docs/api/reference.md`, `docs/README.md`, `docs/backend/cloud-functions.md` | rewrite the `releaseBusinessVat` entries to the branch signature |

---

## 4. Drop list (main-only code that duplicates the branch)

| Main file(s) | Replaced by (branch) |
|---|---|
| `functions/src/providers/vatNumber.ts` (+test), `src/lib/vatNumber.ts` (+test) | same-named branch files (identical checksum logic) |
| `functions/src/providers/businessApplication.ts` (+test) | branch file (port only M-5) |
| `functions/src/providers/businessVatClaim.ts` (+test) | `claimBusinessVat` in branch `businessApplication.ts` |
| `functions/src/providers/releaseBusinessVat.ts` (+test) | `releaseBusinessVat` in branch `businessAdmin.ts` (TS2308 if both kept) |
| main's `applyAsProvider.ts` body and `ApplyAsProviderErrorCode` | branch handler (port S-1 only) |
| main's non-transactional `commitDecision.ts` | branch transaction (port M-7 only) |
| `functions/src/types.ts` duplicates `ProviderType`, `BusinessDetails` | `businessTypes.ts` |
| main rules helpers `accountTypeUnchanged`, `businessProtectedUnchanged`, `businessWebsiteSafe`, instructors `providerType` restrictions, duplicate `businessVat` block; main's `functions/test/business-rules.test.ts` | branch rules and tests (port M-6 cases) |
| denormalised `instructors.providerType` (applyAsProvider, commitDecision `application.providerType`) | derived badge from the map |
| `src/lib/businessDetails.ts` (+test), `src/components/provider/BusinessDetailsForm.tsx` (+test), `ProviderTypeToggle.tsx` (+test), `src/hooks/useBusinessDetails.ts` (+test), `src/components/provider/BusinessProfileSection.tsx` (+test), `src/lib/firebase/business.ts` (+test) | branch files of the same or equivalent names (`ProviderTypeChoice`, `businessProfile.ts`); port M-4 only |
| `src/components/admin/providers/BusinessDetailsCard.tsx` (+test), `src/lib/admin/providerDecisionError.ts` (+test) | `BusinessReviewCard` + `BusinessAdminActions`; `ADMIN_BUSINESS_ERRORS` |
| `src/lib/bookingProvider.ts` `publicBusiness`/`providerImageUrl`/`PublicBusiness` (name clashes with branch `PublicBusiness`) | `src/lib/publicBusiness.ts` |
| providers list `providerType` filter: `providersListQuery(.test).ts`, `admin.ts` `providerTypeConstraint`, `ProvidersListView(.test).tsx`, `src/types/admin.ts`, `src/lib/queryKeys.ts` changes, the 4 `providerType` indexes, `scripts/verify-admin-list-indexes.mjs` changes, `scripts/backfill-provider-type.mjs` | `providerKind` filter, 4 prod indexes, branch verify script |
| `src/types/instructor.ts` `Provider.business: BusinessDetails` (exposes legal fields to public pages), `src/types/booking.ts` `business` pick | branch public subset |
| `ProviderCreateView.tsx` `providerType: 'individual'` line (+ its test assertion) | none (I-5) |
| `src/hooks/useProviderApplication.ts`, `providerApplication.ts`, `functions.ts` business wrappers, `RegisterClient.tsx`, `BecomeProviderCard.tsx`, `ProviderOptInField.tsx`, `profile/edit/page.tsx`, `provider/layout.tsx`, `booking/page.tsx`, `ProviderProfileClient.tsx`, `useProviderPublicProfile.ts`, `providers.ts`, `firebookings.ts` business edits | branch versions (re-add only the venue pieces listed in §3) |
| main's `docs/user-journeys/business-signup(.it).md`, screenshots under `docs/user-journeys/screenshots(-it)/business-*` | branch guides; regenerate venue/gym screens (the originals show main's UI) |

---

## 5. Merge plan

### 5.1 Pre-flight

```bash
cd ~/projects/vfit
git branch --show-current            # main; Codebuff shares this checkout, recheck before every step
git status --short                   # clean (the only expected new file is this report, committed)
git worktree prune                   # drops the stale "wt-business" entry that still claims feat/business-accounts (if it stays listed as prunable, remove .git/worktrees/wt-business by hand)
git rev-parse feat/business-accounts # 877b04c...
```

### 5.2 Build the reconciled branch

```bash
git worktree add ../vfit-reconcile -b reconcile/business-accounts 32ffc26
cd ../vfit-reconcile
# node_modules symlinks only for local gates; never commit them:
echo '/node_modules' >> "$(git rev-parse --git-common-dir)/info/exclude"
echo '/functions/node_modules' >> "$(git rev-parse --git-common-dir)/info/exclude"
ln -s ~/projects/vfit/node_modules node_modules
ln -s ~/projects/vfit/functions/node_modules functions/node_modules

git merge --no-ff feat/business-accounts      # 6 conflicts, §5.3
# resolve, git add <the six files only>, git commit  (default message + "Merge feat/business-accounts ... deployed to prod 2026-10-06")
```

Merge base of `32ffc26` and the branch is `4fff23e`, so Git sees only the branch's 25 commits and the snapshot's changes. `firestore.indexes.json`, `src/i18n/messages/*.ts`, `functions/src/index.ts`, `src/types/*.ts`, `src/lib/firebase/functions.ts` auto-merge (62 composite indexes, 1 fieldOverride; no duplicate i18n keys).

### 5.3 The 6 conflicts of `git merge feat/business-accounts` into `32ffc26`

| File | Hunks | Winner and why |
|---|---|---|
| `firestore.rules` | 2, both inside `match /instructors/{instructorId}`: snapshot's `partnerStatus` equality vs branch's `!('business' in ...)` / `isAllowedOwnerBusinessUpdate()` | **Both, AND-ed.** create: `... && request.resource.data.get('partnerStatus','pending') == 'pending' && !('business' in request.resource.data)))`; update: `... partnerStatus equality && isAllowedOwnerBusinessUpdate());`. The snapshot's rule protects partner-gym state, the branch's protects reviewed business data; neither subsumes the other. |
| `src/app/providers/detail/ProviderProfileClient.tsx` | line 103: snapshot `publicServices` vs branch `headerImage` | **Both lines** (adjacent, independent). |
| `src/hooks/useProviderPublicProfile.test.ts` | imports | **Union:** `ProviderNotFoundError, toProviderPublicProfile, useProviderPublicProfile` and `collection, getDoc, getDocs`. |
| `src/lib/firebase/providers.test.ts` | mock factory for `getDocs/query/where/limit` | **Snapshot form** (`args[0]`); the trial tests and `tsc` pass with it. |
| `docs/database-schema.md` | adjacent additions (snapshot "Group course collections", branch "Business account writes") | **Both**, snapshot first. |
| `docs/features.md` | adjacent additions (snapshot courses, branch guide links) | **Both**, snapshot first. |

Everything else keeps the branch version because the snapshot never touched it (this includes every business file, `adminIndex.ts` pair, `deleteUserCascade`, `roles.ts`, admin components, i18n additions).

Gates at this point (all green in the trial): `npx tsc --noEmit -p .`, `npx vitest run` (root), `cd functions && npx tsc --noEmit -p . && npx vitest run src/providers src/users`. Also run `npm run lint && npm run build` in `functions/`.

### 5.4 Port the delta as reviewable commits (on `reconcile/business-accounts`)

| Commit | Content |
|---|---|
| R1 | M-1, M-2, M-6 (rules keys + `activePartnerGym`), M-10 locale keys for types |
| R2 | M-3 (listing, venue pages, admin venues) |
| R3 | M-4, M-5 (form + server contract + web wrappers) |
| R4 | M-7, M-8, M-9 (venue on approval, mirror, error mapping, admin review card) with fake-based tests |
| R5 | S-1 (apply hardening) |
| R6 | S-2 (+ new `socialLinks` rules), S-3 |
| R7 | S-4, S-5 |
| R8 | N-1..N-3 as time allows |
| R9 | docs: B12 task and a "Reconciliation 2026-10-19" log entry added to the **branch's** plan file (carry main's open follow-ups D4, D8, D9, D10, D12, D13, D15, D16 and the booking-badge note), schema/features/cloud-functions/API reference rewritten to the branch's `releaseBusinessVat`; restore the files below |

A naive `git merge main` at this point would conflict in 57 files: `docs/database-schema.md`, the plan, both guides, `firestore.indexes.json`, `firestore.rules`, `applyAsProvider(.test).ts`, `businessApplication(.test).ts`, `commitDecision.ts`, `searchIndex.ts`, `vatNumber(.test).ts`, `business-rules.test.ts`, `verify-admin-list-indexes.mjs`, `booking/page.tsx`, `provider/layout.tsx`, `verifications/page.tsx`, `RegisterClient.tsx`, `ProviderProfileClient.tsx`, `EntityDetailLayout.tsx`, `ProviderApplicationsPanel.tsx`, `ProviderDetailView(.test).tsx`, `ProviderTabsContent.tsx`, `ProvidersListView(.test).tsx`, `VenuesListView(.test).tsx`, `ProviderOptInField.tsx`, `BecomeProviderCard(.test).tsx`, `BusinessDetailsForm(.test).tsx`, `BusinessProfileSection(.test).tsx`, `useProviderApplication.ts`, `useProviderPublicProfile.ts`, five `i18n/messages/*.ts`, `providersListQuery(.test).ts`, `businessDetails(.test).ts`, `functions.ts`, `providerApplication.ts`, `providers.ts`, `queryKeys.ts`, `vatNumber(.test).ts`, `types/{admin,firebase,instructor}.ts`. That is why the delta is ported by hand.

### 5.5 Files that exist only on main (or only in main's version) and must be restored

Restore with `git checkout main -- <path>` into `reconcile/business-accounts` (R9), taking care to **merge, not overwrite**, the ones marked M:

| Path | Why |
|---|---|
| `docs/superpowers/plans/2026-10-19-unified-courses.md` | the P2 plan (main-only) |
| `docs/user-journeys/business-signup-verification.md` | main's D1-D16 defect log; update statuses for what the branch already fixes |
| `docs/reports/2026-10-19-business-reconciliation-analysis.md` | this report (created on main after the work above) |
| `docs/deployment/staging.md` (M), `docs/README.md` (M), `docs/api/reference.md` (M), `docs/backend/cloud-functions.md` (M) | index entries, staging checklist; fix the `releaseBusinessVat` signature |
| `docs/plans/2026-10-04-business-accounts-plan.md` (M) | use the branch's file; add the B12 section and main's 2026-10-19 Log entries as a "Rebuild on main (superseded)" appendix so the follow-ups are not lost |
| `scripts/backfill-provider-type.mjs` | **do not restore** (dropped); mention in the plan log |
| the venue/gym screenshots among `docs/user-journeys/screenshots(-it)/business-0[69]*.png`, `business-10-*.png` | only if the guides keep those steps; otherwise re-shoot |
| `docs/superpowers/specs/2026-10-19-unified-group-courses-design.md` | already in `32ffc26`; nothing to restore |

### 5.6 Record main as merged and fast-forward

```bash
# in the reconcile worktree, after the gates pass
git merge -s ours main -m "Record main (1fa024b + report) as merged: business accounts reconciled on feat/business-accounts"
cd ~/projects/vfit
git branch --show-current            # main, still clean, tip unchanged since the report commit
git merge --ff-only reconcile/business-accounts
git worktree remove ../vfit-reconcile
# push later with: gh auth switch --user hidran   (the active account gets a 403)
```

`-s ours` keeps the reconciled tree and makes `1fa024b` an ancestor, so the fast-forward is valid and history keeps both lines. If anything lands on `main` in between (Codebuff), repeat `git merge -s ours main` first.

Keep `feat/business-accounts` (it is the audit trail of the production deploy) and tag `877b04c` as `release/business-accounts-2026-10-06` before any cleanup.

---

## 6. Risks and deployment

### 6.1 Risks

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | **Version skew between hosting and functions** (releaseBusinessVat input, `expectedReview`, error codes). Staging is mixed today. | High on staging, high impact: company approval and release fail. | Always deploy rules, indexes, functions, hosting from the same commit, in that order; smoke test approval and release after. |
| 2 | **Owner lockout by rules** (`hasOnly(businessKeys())` vs venue keys), and `users` create rule vs `ProviderCreateView`. | Certain if M-6 or the I-5 drop is forgotten. | M-6 with tests; drop the `providerType` line; run the emulator suites `functions/test/business-rules.test.ts`, `chat-rules`, `booking-rules`, `partner-gyms-rules` (not run in this analysis). |
| 3 | **Production has never run the courses/gym stack**: prod has 53 indexes and none of the 9 snapshot indexes; its rules and hosting came from the branch tree. Deploying the reconciled branch ships the whole snapshot (courses, participants, partner gyms) for the first time. | Medium; independent of business accounts but unavoidable with this branch. | Indexes first and wait until all are READY (`scripts/verify-admin-list-indexes.mjs` plus the courses queries), then rules, functions, hosting with `build:prod` (`.env.local` is staging). Staging smoke first. Decide explicitly whether courses go to prod with this release. |
| 4 | **Index deployment deleting live indexes**: main's file lacks the 4 `providerKind` indexes. | Medium if the wrong file is deployed. | Use only the reconciled 62-entry file; never run `firebase deploy --only firestore:indexes --force` on prod; compare with `production-indexes.json` (53) before and after. |
| 5 | **B12 port regresses the branch's transactional invariants** (listed-company-per-tax-id, `review_required`, `claim_missing`) or double-creates a venue under contention. | Medium; the most delicate edit. | Create inside the existing transaction, map code 6 to `venue_exists`, tests on `fakeFirestore` (contention re-run, stale review, claim missing, two approvals), no new reads after writes. |
| 6 | Orphan venues (convert, user deletion) and publicly listed pending venues with coordinates on `/fit/gyms`. | Low volume now; real once companies approve. | S-4; product call on whether pending venues should be public. |
| 7 | Hidden duplicates after merge: two `releaseBusinessVat` exports (TS2308), two `PublicBusiness` types, `ownerUid` vs `ownerId`, duplicate i18n keys. | Caught by `tsc`/`completeness.test.ts`. | Follow §4; gates after every R-commit. |
| 8 | Longer main-era values (I-9) or `venueType` defaults on old pending companies. | Low (synthetic staging data). | Clean or ignore staging test companies; verify with one query before prod. |

### 6.2 Staging (`vfit-app-staging`) is running main's build

What main's deploys overwrote there, and what restores the reconciled state (from a clean worktree of the reconciled commit; every command with explicit `-P`, outside the sandbox, functions lint via `npm run lint`):

| Surface | Current on staging (main@1fa024b) | Redeploy |
|---|---|---|
| Rules | main's (`accountTypeUnchanged`, `activePartnerGym` types, no business admin guards) | `firestore:rules` from the reconciled commit |
| Indexes | 62 + the 4 `providerType` (and, from the earlier branch restore, probably the 4 `providerKind`) | `firestore:indexes` (additive, wait READY). Afterwards delete the 4 orphan `providerType` indexes (console or `--force` on staging only). |
| Functions overwritten by main | `applyAsProvider`, `decideProviderApplication`, `releaseBusinessVat`, `syncBusinessVenueLocation`, `onInstructorWriteSearchIndex`, the partnerGyms callables, `chatWithAssistant` | redeploy these from the reconciled commit; also redeploy the branch-owned ones to be sure they match: `convertBusinessToIndividual`, `updateBusinessTaxId`, `verifyProvider`, `onUserWriteAdminIndex`, `adminDeleteUser`, `adminBulkDeleteUsers`, `onAdminJobCreated`. `syncBusinessVenueLocation` needs `--force` (retry trigger). Simplest: `--only functions` for the whole codebase. |
| Hosting | main's build | `npm run build:staging`, then `hosting` |
| Data | companies, claims and `venues/biz_*` created by main's flows; `users.providerType: 'individual'` on providers | usable as is after M-6; delete the synthetic companies (Auth, users, instructors, `businessVat`, `venues/biz_*`) once verified; run `scripts/backfill-search-tokens.mjs` dry run to confirm no `providerKind` gaps |

After the redeploy repeat the B10 journey on staging (signup as company with venue type, duplicate tax id, admin approval with review snapshot, venue appears on `/fit/gyms`, owner edits name/logo, release/convert/tax-id correction, 320/390 px, it and de) and update `docs/user-journeys/business-signup-verification.md`.

### 6.3 Production

Production already runs the branch; its indexes (53) are `firestore.indexes.json` at `877b04c`. The reconciled deploy adds: the 9 courses/gym indexes (§1.8), the merged rules, `syncBusinessVenueLocation`, changed `commitProviderDecision`/`applyAsProvider`, partner-gym and course functions, hosting. No data migration is needed for businesses (none recorded); `providerKind` stays. Before deploying: one read-only count of `businessVat` and business users on `vfit-funlife`; confirm `systemSettings/providerOnboarding.autoApprove` and that no one else deployed from a different tree since 2026-10-06 (`git fetch && git log HEAD..origin/main`).

## 7. Decisions needed from the owner

1. Verified individual applying as a company: keep the branch behaviour (drops to pending) or refuse with `provider_type_locked` (recommended, S-1; no UI entry point either way).
2. Ship courses/gym to production together with the reconciled business release, or keep prod on the branch tree until P2 lands (affects risk 3).
3. Should a pending B12 venue with coordinates be public on `/fit/gyms` (main's current intent) or only after an admin sets `partnerStatus`?
4. Description/city/website limits at the data layer (I-9): branch limits (1 000/80/200) or main's.
