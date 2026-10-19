# VFit — Business (Company) Accounts Plan

> **Created:** 2026-10-04 · **Baseline commit:** `24e7484` (main)
> **Goal:** a company (e.g. a small business offering karate, animation and other sports) can register,
> get approved, be listed and be booked like any provider — and admins can see and review it.
> **Approach (approved 2026-10-04):** a business is a provider with `providerType: 'business'` in the
> existing `instructors` catalogue plus business details. No new top-level collection; search, booking,
> availability, services, reviews and payments are reused untouched.
> **Resume rule:** find the first task whose status is not `[x]`/`[-]`, read its "Done when", continue.
> Update the status box **and** the "Log" at the bottom in the same commit as the work.

Status legend: `[ ]` todo · `[~]` in progress (write who/when in the Log) · `[x]` done (commit hash) · `[-]` dropped (why) · `[?]` blocked on the user.

---

## 0. How to work on this plan (read first)

Same working rules as `docs/plans/2026-09-29-communication-booking-plan.md` §0 and
`docs/plans/2026-10-01-journey-ui-fixes-plan.md` §0 — read those; the deltas are below.

- **Branch:** `main`. Codebuff shares this checkout: `git branch --show-current` before every commit,
  `git fetch && git log HEAD..origin/main` before prod deploys. Stage only the files you touched.
- **Dirty tree before a functions deploy:** a functions deploy ships the whole working tree. If other
  uncommitted `functions/` edits exist, deploy from a clean `git worktree` of your commit (symlink
  `functions/node_modules` from the main checkout; `npm ci` fails on the root-owned npm cache).
- **Gates per task:** `npx tsc --noEmit -p .`, `npx vitest run <touched paths>`, i18n completeness test
  (every new/changed key in **it, en, es, fr, de**; Italian is the source). Functions touched →
  `cd functions && npm run lint && npm run build`.
- **Test baseline:** 50 pre-existing vitest failures in 17 files on main (2026-09-30). Stash-compare before
  blaming a change.
- **Browser-verify every UI task** with Playwright at 390×844 (dark, and light where colours change), fresh
  private context. Demo accounts (password `VfitDemo!2026`): customer / admin / provider
  `@vitfitdemo.dev`. Staging journey accounts: `journey.{en,it}.{provider,customer}@vitfitdemo.dev`
  (password `JourneyDemo!2026`).
- **Environments:** `vfit-app-staging` = staging, `vfit-funlife` = prod. Every deploy command needs explicit
  `-P`; prod builds use `build:prod`. Always staging first, smoke-test, then prod. Firebase CLI deploys
  need to run outside the sandbox (local port bind) and a valid `firebase login`.
- **Nested-flag rule:** anything that writes `instructors/{uid}` with `set(..., {merge:true})` must use
  nested maps, never dotted keys (see `instructorVerificationPatch`, commit `6548ede`). Every new write in
  this plan gets a test asserting no key contains a dot.

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Business = `users/{uid}.providerType: 'individual' \| 'business'` (default `individual`) + `instructors/{uid}.business` map | Reuses the whole catalogue; existing providers need no migration to keep working (amended: `scripts/backfill-provider-type.mjs` types them `individual` so the admin "Privati" filter finds them) |
| D2 | Businesses are **always** approved manually, even when `providerOnboarding.autoApprove` is ON | Someone should check the P.IVA before a company is listed |
| D3 | P.IVA mandatory, Italy only (11 digits + checksum) | Matches the market; other countries later |
| D4 | One owner account per business in phase 1 | Team members and venues are phases 2–3 |
| D5 | One business per P.IVA (uniqueness claim, written in a transaction) | Stops duplicate registrations and squatting |
| D6 | After approval the owner may edit display fields (name, logo, website, description, city) but **not** `legalName` / `vatNumber` | Those are what the admin verified; changes go through an admin |

## 2. Data model

```
users/{uid}
  providerType: 'individual' | 'business'          # absent ⇒ individual

instructors/{uid}
  business?: {
    legalName: string,        # ragione sociale — admin-verified, owner read-only after approval
    vatNumber: string,        # 11 digits, validated; owner read-only after approval
    displayName: string,      # shown publicly; also copied to name/fullName
    description?: string,
    website?: string | null,
    logoUrl?: string | null,
    city?: string,
  }

businessVat/{vatNumber}      # uniqueness claim: { uid, createdAt } — Admin SDK only
```

Public `name`/`fullName` of a business instructor = `business.displayName`, so every existing card, search
token and booking screen shows the company name with no further change.

---

## 3. Phase 1 — registration, approval, listing, booking

### B1 `[x]` (e308d61) Italian P.IVA validator (Small)
- Files: `functions/src/providers/vatNumber.ts` (+ `.test.ts`), `src/lib/vatNumber.ts` (+ `.test.ts`) — the
  same ~15 lines in both trees (functions and web don't share a package), kept identical by a test fixture
  list used by both.
- Rules: strip spaces and an optional `IT` prefix; exactly 11 digits; Luhn-style check digit (odd positions
  as-is, even positions doubled with digit-sum, sum + check ≡ 0 mod 10); the all-zero string is invalid.
- **Done when:** unit tests cover valid numbers, wrong length, non-digits, bad check digit, `IT` prefix,
  surrounding whitespace, all zeros.

### B2 `[x]` (c21d652, 2986e70, 63d0680) Types and schema docs (Small)
- Files: `src/types/firebase.ts` (`ProviderType`, `BusinessDetails`, `User.providerType`),
  `src/types/instructor.ts` (`Provider.providerType`, `Provider.business`), `functions/src/types`,
  `docs/database-schema.md` (users, instructors, new `businessVat`).
- **Done when:** `tsc` clean; schema doc describes the three additions and the read/write access of each.

### B3 `[x]` (ab6e1bc, 2e052dc, 6ba0f15) `applyAsProvider` accepts a business (Large)
- Files: `functions/src/providers/applyAsProvider.ts`, `commitDecision.ts`, `applicationDecision.ts`,
  `src/lib/firebase/functions.ts` (typed wrapper), tests beside each.
- Input: `providerType?: 'individual'|'business'`, `business?: {legalName, vatNumber, displayName,
  description?, website?, city?}`. For `business`: validate with B1, require non-empty legal/display names,
  cap lengths, normalise `vatNumber` to bare digits, reject a non-http(s) website.
- Uniqueness (D5): in one transaction, create `businessVat/{vat}` or fail `already-exists` with a stable
  error code the client maps to a message — unless the existing claim's `uid` is the caller (idempotent
  re-apply).
- Always take the pending branch for businesses (D2), regardless of `autoApprove`. Write
  `users.providerType`, and `instructors.business` as a **nested map**, with `name`/`fullName` =
  `displayName`.
- `commitProviderDecision` (admin approval) must not overwrite `name`/`fullName` with a null application
  name, and must leave `business` untouched; on rejection release nothing (the claim stays so the same
  person can re-apply — an admin can free it from the admin panel in B8).
- **Done when:** tests cover: invalid P.IVA, duplicate P.IVA, idempotent re-apply, autoApprove ON still
  yields pending, individual path unchanged, no dotted keys, approval keeps the company name.

### B4 `[x]` (469e977, 9fe7b18) Firestore rules (Medium)
- Files: `firestore.rules`, `functions/test/` rules test (emulator pattern of `chat-rules.test.ts`).
- Owner update of `instructors/{uid}` may change `business.displayName/description/website/logoUrl/city`
  but not `business.legalName`, `business.vatNumber`, or create/remove the `business` map (D6).
  `businessVat/*`: no client read or write.
- **Done when:** rules tests: owner edits display field ✔, owner edits P.IVA ✘, owner adds `business` to an
  individual ✘, other user ✘, admin ✔, client read of `businessVat` ✘.

### B5 `[x]` (683bf37, 1b66998, 115aac0) Signup: individual or company (Large)
- Files: `src/app/auth/register/RegisterClient.tsx` (both `submitProviderApplication` call sites),
  `src/hooks/useProviderApplication.ts`, `src/lib/firebase/providerApplication.ts`,
  `src/components/profile/BecomeProviderCard.tsx`, new `src/components/provider/BusinessDetailsForm.tsx`
  (React Hook Form + Zod, validator from B1), i18n keys in all five locales.
- Flow: after choosing "professional", a two-option control "Individual / Company"; Company reveals legal
  name, P.IVA, public name (defaults to legal name), city, website. The same control appears in
  `BecomeProviderCard` for existing customers.
- Pending state: the existing "application under review" screens are reused; copy for a company mentions
  that the P.IVA is being checked.
- **Done when:** at 320 and 390px, in it and de: no overlap, 44px targets, inline errors for bad P.IVA and
  duplicate P.IVA; a company application ends on the pending screen; an individual still auto-approves.

### B6 `[x]` (67c7687, 2c3a594) Company profile editing (Medium)
- Files: provider profile edit (`src/app/(main)/profile/edit/page.tsx` area), reuse
  `BusinessDetailsForm` in "edit" mode with `legalName`/`vatNumber` read-only, logo upload through the
  existing photo upload hook.
- Saves display fields to `instructors/{uid}.business.*` (nested via `updateDoc` with dotted *paths*, which
  `updateDoc` resolves correctly — unlike `set` with merge) and mirrors `displayName` to `name`/`fullName`.
- **Done when:** owner can change public name and logo, search shows the new name after the index trigger
  runs, attempts to change P.IVA are impossible in the UI and rejected by rules (B4).

### B7 `[x]` (1251b2f, 14e7add) Public listing and search (Medium)
- Files: `src/lib/firebase/providers.ts` (`flattenProvider` reads `providerType`, `business`),
  provider card and booking-page components, `functions/src/providers/onInstructorWriteSearchIndex.ts`
  (add `displayName` and `legalName` tokens), i18n `provider.badge.business` ("Azienda" in it).
- **Done when:** an approved company shows its name, logo and an "Azienda" badge in `/booking` search and on
  its own page; searching the legal name finds it; individual cards unchanged.

### B8 `[x]` (1ed2c91, c3da677, 2483261) Admin visibility (Medium)
- Files: `src/components/admin/providers/ProvidersListView.tsx` (+ test), `ProviderDetailView.tsx`,
  admin store/query for the type filter; a small admin callable `releaseBusinessVat` (superadmin or admin,
  audit-logged) to free a P.IVA claim; `src/components/admin/venues/VenuesListView.tsx` gets a read-only
  "owner" column showing `venues.ownerId` (the field the venue types, partner-gym store and `managesGym` rule already use; **not** `ownerUid`).
- List: type filter (all / individual / business) and a company badge. Detail: a business block with legal
  name, P.IVA, website, and the existing approve/reject actions. Every mutation writes `audit_log`
  (project policy).
- **Done when:** admin (not only superadmin) can filter companies, open one, see the P.IVA and approve it;
  approval makes it appear in search; release action works and is audited.

### B9 `[x]` (5d1b016) i18n, accessibility, docs (Small)
- All new keys in it/en/es/fr/de, `completeness.test.ts` green; labels tied to inputs, errors announced
  (`aria-live`), focus moves to the first error.
- Docs: `docs/features.md` (business accounts), `docs/backend/cloud-functions.md` (new input of
  `applyAsProvider`, `releaseBusinessVat`), user-journey guide for business signup in it and en.

### B10 `[ ]` Browser verification (Medium)
Run on **staging** with a fresh journey account (see §0):
1. Register as a company with a valid P.IVA → pending screen.
2. Same P.IVA from a second account → duplicate error.
3. Admin opens `/admin/providers`, filters companies, approves.
4. Company appears in search with the badge; a customer books a service; the booking shows the company name.
5. Owner edits public name and logo; tries nothing on P.IVA.
Screenshots into `docs/user-journeys/` where the guide needs them.
- **Done when:** all five steps pass at 390×844 in dark and light, and in it.

### B11 `[ ]` Deploy (Medium)
Order: `firestore.rules` → functions (`applyAsProvider`, new/changed callables, search-index trigger; use
`--only functions:<names> --force`, wait for indexes READY) → hosting. Staging smoke (B10 steps 1–4), then
the same on prod with a throwaway P.IVA claim removed afterwards.
- **Done when:** staging and prod run the commit; prod smoke leaves no test company behind.

### B12 `[x]` (0d849bd, 9bd6762) Approval creates the business's venue (Medium)
Added 2026-10-19 from `docs/superpowers/specs/2026-10-19-unified-group-courses-design.md` §3.
- `VenueType` (`src/types/venue.ts`, functions types) gains `'school' | 'studio'`; a shared helper
  `hostsCourses(type)` = gym | school | studio replaces every `type === 'gym'` gate
  (`configureGymInstructor` in `functions/src/partnerGyms/schedule.ts`, `assertGymManager` in
  `functions/src/partnerGyms/store.ts`, the `activePartnerGym` rule, the timetable button in
  `VenueDetailClient`). `/fit/gyms` lists all three types; its title becomes "Gyms & schools" in it/en/es/fr/de.
- Company form (B5) gains `venueType: 'gym' | 'school' | 'studio' | 'none'` (default `gym`) and a street
  address; `business` map stores `venueType`, `address`. `none` = no fixed premises → no venue.
- `commitProviderDecision` approving a business with `venueType != 'none'` creates `venues/{auto}` in the
  same transaction: `{name: business.displayName, type: venueType, address, city, ownerId: uid,
  partnerStatus: 'pending', isPartner: false, isActive: true, memberDiscountPercent: 0,
  partnerInstructorExtraPercent: 0, createdAt}` and writes `instructors/{uid}.business.venueId` (nested
  map, no dotted keys). Idempotent: if `business.venueId` is already set, no second venue.
- Admin provider detail (B8) shows a link to the venue; the venue detail already edits partner status.
- **Done when:** tests cover: approval creates exactly one venue owned by the business, re-approval creates
  none, `none` creates none, individual approval creates none, no dotted keys; the new venue appears in
  `/fit/gyms` on staging; a school-type venue passes `hostsCourses` gates.

---

## 4. Later phases (planned separately once phase 1 ships)

- **Phase 2 — Team:** `businessMembers` collection; the owner invites trainers by email; bookings of a
  business service route to a member; per-member availability; the business page lists its team.
- **Phase 3 — Venues:** make `venueStaff` real (schema + admin tool), `venues.ownerId` + "assign owner /
  manager" in `/admin/venues`, and a venue application path for real partner gyms. This is what finally
  gives admins ownership visibility over the ~130 seeded venues.

## 5. Risks and open points

- **`commitProviderDecision` name overwrite** — it sets `name` from the application when one is passed; a
  business must keep `displayName` (covered in B3 tests).
- **Search index trigger** — name changes only propagate when `onInstructorWriteSearchIndex` runs; check
  its idempotency so a logo-only edit doesn't loop.
- **Uniqueness claim vs. rejection** — a rejected company keeps its claim; the admin release action (B8)
  is the escape hatch. If rejections turn out to be common, release automatically on rejection instead.
- **Non-Italian companies** are out of scope (D3); the validator is isolated so a country switch is local.
- **Legal copy** — the terms/privacy pages don't mention business data; confirm wording with the owner
  before prod (`[?]` if they want a change).

## 6. Log

- 2026-10-04 — Plan written after the design was approved ("go for C"). No tasks started.
- 2026-10-19 — B8 owner field corrected to `ownerId`; B12 added (venue on approval, school/studio types) per the unified-courses spec. Execution started (subagent-driven, on main).
- 2026-10-19 — B8 done (1ed2c91, c3da677 + review fixes): providers list type filter + Azienda badge, company block with "Libera P.IVA" (`releaseBusinessVat`, audited, idempotent), `businessVatClaim.ts` extracted, venues owner column + school/studio, 4 new `users` indexes (deploy in B11). `business.website` is stored as the parsed href and the rules (`businessWebsiteSafe`) accept an http(s) value only when it CHANGES. **B11 runs `scripts/backfill-provider-type.mjs` per environment (dry run first, then `--apply`) before relying on the Privati filter; D1 "no migration" amended** — providers who applied before B3 carry no `providerType`, so `== 'individual'` misses them until it runs.
- 2026-10-19 — Follow-up (not done): `socialLinks.website/linkedin` are owner-written and unconstrained in the rules; B8 only makes the UI render non-http(s) values as text (`socialLinkHref` / `safeHttpUrl`). Add a rules check like `businessWebsiteSafe` for `users.socialLinks` / `instructors.socialLinks`.
- 2026-10-19 — B5 done: "Privato / Azienda" toggle in ProviderOptInField and BecomeProviderCard, `BusinessDetailsForm`, `useBusinessDetails` hook (state, pure `validateBusinessDetails`, server-code mapping, deferred focus to the first bad field), 32 i18n keys ×5 locales, company pending copy on the profile card and the provider banner. B5 uses controlled state + pure validator instead of RHF+Zod (register page is hand-rolled state; avoids nested form); form adds venueType + address for B12.
- 2026-10-19 — B8 done (2483261): type filter + 4 users indexes (deploy first in B11), BusinessDetailsCard + audited `releaseBusinessVat`, businessVatClaim.ts extraction, venues owner column, safeHttpUrl + website rule, social link hrefs. Open minors: ProviderCreateView should write providerType 'individual' (fold into B12); Instagram href via socialLinkHref; backfill summary should label FAILED_PRECONDITION as 'skipped (changed)'.
- 2026-10-19 — Execution order changed: B12 before B9/B10/B11 so docs, browser verification and deploy cover venue creation once.
- 2026-10-19 — B7 done (14e7add): search index adds business names name-first; `providerImageUrl`/`publicBusiness` helpers in src/lib/bookingProvider.ts; Azienda badge on /booking rows and provider page. **B11 must run `scripts/backfill-provider-search.mjs` on each environment** so existing business docs get the new terms; B10 should eyeball the two-badge wrap at 320px it/de.
- 2026-10-19 — B6 done (2c3a594): BusinessProfileSection on the professional tab, `updateBusinessDetails` allowlisted dotted paths + name/fullName mirror, logo to instructors/{uid}/gallery. Follow-up: the page's unsaved-changes guard ignores the section (own Save button).
- 2026-10-19 — B4 done (9fe7b18): `accountTypeUnchanged` + allowlist `businessProtectedUnchanged` on instructors owner update, owner create cannot carry `business`/`providerType: business`, `businessVat` deny-all; 22 rules tests. Admins may change users.providerType (intended, D1).
- 2026-10-19 — B3 done (6ba0f15): businessApplication.ts validator, transactional businessVat claim, always-pending for business, review-bypass guards (business lock, rejected never auto-approves, verified no-op incl. legacy docs), result gains `status`; `ApplyAsProviderErrorCode` exported; `BUSINESS_VAT_COLLECTION` exported for B8. Deferred: extract businessVatClaim.ts in B8; audit entry lacks providerType.
- 2026-10-19 — B2 done (63d0680): canonical 8-value `VenueType` (adds school/studio; keeps outdoor_space/event_space), `hostsCourses` in both trees with Record-table tests; B12 must also add school/studio to VenueFormView/VenuesListView options and functions/src/ai/tools/index.ts enum.
- 2026-10-19 — B1 done (e308d61): validator in both trees, 19+19 tests; follow-up for B3: add a check-digit-0 fixture (e.g. 50500000000) and `typeof === 'string'` guard before calling from callables.
- 2026-10-19 — B12 done: `commitProviderDecision` creates `venues/{auto}` (pending, non-partner, owned by the business; built by pure `providers/businessVenue.ts`) in the approval batch and links it as nested `business.venueId`; idempotent via that field. `syncBusinessVenueLocation` mirrors the owner's lat/lng/city onto the venue (geohash trigger follows). `hostsCourses` replaces the gym gates (schedule, store, `activePartnerGym` rule, VenueDetailClient, plus the admin `GymInstructorPanel` gate in VenueDetailView); `/fit/gyms` lists gym+school+studio via `types` (`where in`, same composite indexes), title "Palestre e scuole" ×5; ProviderCreateView writes `providerType: 'individual'`. **B11 deploys the new trigger (`functions:syncBusinessVenueLocation`) and the rules.** Known gaps (see the follow-up entry below): a business approved before B12 shipped has no venue (re-approval creates one); `venueType` of an already-approved business can't be changed by the owner (rules freeze it).
- 2026-10-19 — B12 review fixes: venue id is deterministic `biz_<uid>` and written with `batch.create`, so two racing approvals collide (loser gets `already-exists` / `venue_exists`, whole batch refused) and a venue already at that id (e.g. admin-promoted) is never overwritten; `syncBusinessVenueLocation` retries and writes the instructor's CURRENT location (admin hand-edits of the venue's city/lat/lng are overwritten by owner moves, intended); `COURSE_VENUE_TYPES` is the single list (client + functions, pinned to the `activePartnerGym` rule by a test); `types: []` matches nothing; hours block hidden for venues without hours. Known gaps / follow-ups: a provider saving a location between the decision's read and its commit leaves the venue without it until their next move; pending venues that have coordinates are publicly listed on /fit/gyms (intended); `VenueCreateView` writes `address` as an object while `Venue` and the business-venue builder use a string.
- 2026-10-19 — B9 done (5d1b016): docs (features, cloud-functions, api reference, schema drift fixed, staging "Business accounts release" checklist), `business-signup.md` / `.it.md` guides (screenshots pending B10, file names `business-01..10-*.png`), Instagram link via `socialLinkHref`, `backfill-provider-type.mjs` reports FAILED_PRECONDITION as "skipped (changed)" without failing, `venue_exists` mapped to `admin.providerDecision.error.venueExists` ×5 at the three approve surfaces (`providerDecisionErrorKey`). `provider_type_locked` only comes from `applyAsProvider` and was already mapped. Open a11y points for B10 to check in a browser: `ProviderTypeToggle` is `role=radiogroup` but both buttons are tab stops with no arrow-key handling; required company fields carry no `required`/`aria-required`; the logo `sr-only` file input stays in the tab order next to its button; the admin provider detail has no link to the venue (B12 mentions one), only the Owner column on `/admin/venues`; `admin.verificationsPage.actionFailed` still says only a superadmin can verify.
