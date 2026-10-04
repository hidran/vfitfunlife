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
| D1 | Business = `users/{uid}.providerType: 'individual' \| 'business'` (default `individual`) + `instructors/{uid}.business` map | Reuses the whole catalogue; existing providers need no migration |
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

### B1 `[x]` Italian P.IVA validator (Small)
- Files: `functions/src/providers/vatNumber.ts` (+ `.test.ts`), `src/lib/vatNumber.ts` (+ `.test.ts`) — the
  same ~15 lines in both trees (functions and web don't share a package), kept identical by a test fixture
  list used by both.
- Rules: strip spaces and an optional `IT` prefix; exactly 11 digits; Luhn-style check digit (odd positions
  as-is, even positions doubled with digit-sum, sum + check ≡ 0 mod 10); the all-zero string is invalid.
- **Done when:** unit tests cover valid numbers, wrong length, non-digits, bad check digit, `IT` prefix,
  surrounding whitespace, all zeros.

### B2 `[x]` Types and schema docs (Small)
- Files: `src/types/firebase.ts` (`ProviderType`, `BusinessDetails`, `User.providerType`),
  `src/types/instructor.ts` (`Provider.providerType`, `Provider.business`), `functions/src/types`,
  `docs/database-schema.md` (users, instructors, new `businessVat`).
- **Done when:** `tsc` clean; schema doc describes the three additions and the read/write access of each.

### B3 `[x]` `applyAsProvider` accepts a business (Large)
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

### B4 `[ ]` Firestore rules (Medium)
- Files: `firestore.rules`, `functions/test/` rules test (emulator pattern of `chat-rules.test.ts`).
- Owner update of `instructors/{uid}` may change `business.displayName/description/website/logoUrl/city`
  but not `business.legalName`, `business.vatNumber`, or create/remove the `business` map (D6).
  `businessVat/*`: no client read or write.
- **Done when:** rules tests: owner edits display field ✔, owner edits P.IVA ✘, owner adds `business` to an
  individual ✘, other user ✘, admin ✔, client read of `businessVat` ✘.

### B5 `[ ]` Signup: individual or company (Large)
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

### B6 `[ ]` Company profile editing (Medium)
- Files: provider profile edit (`src/app/(main)/profile/edit/page.tsx` area), reuse
  `BusinessDetailsForm` in "edit" mode with `legalName`/`vatNumber` read-only, logo upload through the
  existing photo upload hook.
- Saves display fields to `instructors/{uid}.business.*` (nested via `updateDoc` with dotted *paths*, which
  `updateDoc` resolves correctly — unlike `set` with merge) and mirrors `displayName` to `name`/`fullName`.
- **Done when:** owner can change public name and logo, search shows the new name after the index trigger
  runs, attempts to change P.IVA are impossible in the UI and rejected by rules (B4).

### B7 `[ ]` Public listing and search (Medium)
- Files: `src/lib/firebase/providers.ts` (`flattenProvider` reads `providerType`, `business`),
  provider card and booking-page components, `functions/src/providers/onInstructorWriteSearchIndex.ts`
  (add `displayName` and `legalName` tokens), i18n `provider.badge.business` ("Azienda" in it).
- **Done when:** an approved company shows its name, logo and an "Azienda" badge in `/booking` search and on
  its own page; searching the legal name finds it; individual cards unchanged.

### B8 `[ ]` Admin visibility (Medium)
- Files: `src/components/admin/providers/ProvidersListView.tsx` (+ test), `ProviderDetailView.tsx`,
  admin store/query for the type filter; a small admin callable `releaseBusinessVat` (superadmin or admin,
  audit-logged) to free a P.IVA claim; `src/components/admin/venues/VenuesListView.tsx` gets a read-only
  "owner" column (empty until phase 3, but the column and field name `ownerUid` are fixed now).
- List: type filter (all / individual / business) and a company badge. Detail: a business block with legal
  name, P.IVA, website, and the existing approve/reject actions. Every mutation writes `audit_log`
  (project policy).
- **Done when:** admin (not only superadmin) can filter companies, open one, see the P.IVA and approve it;
  approval makes it appear in search; release action works and is audited.

### B9 `[ ]` i18n, accessibility, docs (Small)
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

---

## 4. Later phases (planned separately once phase 1 ships)

- **Phase 2 — Team:** `businessMembers` collection; the owner invites trainers by email; bookings of a
  business service route to a member; per-member availability; the business page lists its team.
- **Phase 3 — Venues:** make `venueStaff` real (schema + admin tool), `venues.ownerUid` + "assign owner /
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
- 2026-10-04 — B1 done (2bf6bcd); B2 done (types + schema docs) (dbd5665).
- 2026-10-04 — B3 done (6d056c7). Pure pieces in `businessApplication.ts` (validateBusinessInput,
  claimBusinessVat, parseProviderType, isExistingBusiness), `shouldAutoApprove` in onboardingSettings,
  `pendingApplicationPatches`/`decisionInstructorPatch` in applicationDecision. Error codes for B5:
  `invalid_vat`, `invalid_business`, `invalid_business_name`, `invalid_website`,
  `invalid_business_description`, `invalid_business_city`, `invalid_provider_type`,
  `vat_already_registered`, `business_account_exists` (an existing business re-applying as an
  individual is refused, else it would be auto-approved unchecked). `description`/`city` are stored
  as "" and `website` as null when empty, so a re-apply through set(merge) replaces stale values.
- 2026-10-04 — B3 review fixes (this commit). D2 race closed: commitProviderDecision's self-apply
  path re-checks `business_account_exists` on its own reads and guards its users/{uid} write with
  `lastUpdateTime`; a stale write maps to `aborted`/`concurrent_update`, which applyAsProvider retries
  once (the admin-index trigger also writes users/{uid} right after signup). P.IVA squatting closed: the
  business transaction reads the instructors doc first; a pending/rejected company moving to a new
  P.IVA releases its own old claim, an approved one gets `vat_change_not_allowed` (D6). A re-apply no
  longer resets bio/rating/reviewCount/createdAt. Handler-level tests with a mocked firebase-admin for
  applyAsProvider and commitProviderDecision.
