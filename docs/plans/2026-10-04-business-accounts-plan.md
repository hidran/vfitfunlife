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
| D3 | An 11-digit Italian tax id is mandatory: the **P.IVA, or the codice fiscale of an association** (ASD/SSD often have no P.IVA; both use the same checksum, so `isValidItalianVat` already accepts both). Stored in `vatNumber`; the UI says "P.IVA / Codice fiscale". Italy only. *(Amended 2026-10-04 after the first real prospect turned out to be an ASD.)* | Matches the market; other countries later |
| D4 | One owner account per business in phase 1 | Team members and venues are phases 3–4 |
| D5 | One business per P.IVA (uniqueness claim, written in a transaction) | Stops duplicate registrations and squatting |
| D6 | After approval the owner may edit display fields (name, logo, website, description, city) but **not** `legalName` / `vatNumber` | Those are what the admin verified; changes go through an admin |

## 2. Data model

```
users/{uid}
  providerType: 'individual' | 'business'          # absent ⇒ individual

instructors/{uid}
  business?: {
    legalName: string,        # ragione sociale — admin-verified, owner read-only after approval
    vatNumber: string,        # 11-digit P.IVA or association codice fiscale, validated; owner read-only after approval
    legalForm?: 'company' | 'sole_trader' | 'association' | 'other',   # added in B3b
    affiliationNumber?: string,   # optional CONI / RASD / ente di promozione registration (B3b); admin-visible only
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

### B3b `[x]` Legal form and affiliation number (Small) — added 2026-10-04
An association is not a "company"; admins reviewing it want to know the legal form and its sports-body
registration. Optional fields only — no existing behaviour changes.
- Files: `functions/src/providers/businessApplication.ts` (+ test), `functions/src/providers/businessTypes.ts`,
  `src/types/firebase.ts`, `src/lib/firebase/functions.ts` (wrapper type), `docs/database-schema.md`.
- `legalForm` ∈ `company | sole_trader | association | other` (default `company` when absent), validated
  against that list (`invalid_legal_form`); `affiliationNumber` optional string ≤ 40 chars after trim,
  stored as `""` when empty (same re-apply rule as `description`/`city`). Nested map, no dotted keys.
- **Hardening carried over from the B3 re-review (same files):**
  1. *Release every other claim the caller holds.* Inside the business transaction, query
     `businessVat where uid == caller` and delete all claims other than the one being taken (pending/rejected
     only; an approved business is refused first). This stops one account accumulating claims even if the
     owner edits `instructors.business.vatNumber` from the client before B4 locks it. Firestore transactions
     allow a query read — do it before any write.
  2. *Validate the stored number before using it as a document id:* run the stored
     `business.vatNumber` through `isValidItalianVat`; ignore it if invalid (a client-written `"a/b"` would
     otherwise make `claimRef` throw `internal`).
  3. *Refuse any business re-apply from an approved account* (`business_already_approved`, a stable code
     for B5): same-number re-apply currently drops an approved company to pending and de-lists it, and its
     next re-apply could change the number. Changes to an approved company go through B6 (display fields)
     or an admin (B8).
  4. *Test fidelity:* in `applyAsProvider.test.ts` make `tx.get` and `ref.get` return different data so the
     in-transaction read is really exercised; make the fake transaction throw on a read after a write
     (apply `expectReadsBeforeWrites` to the handler too); add one handler test that does NOT mock
     `commitProviderDecision`: first commit throws code 9 while the docs become a business, and the retry
     must end in `business_account_exists`.
- **Done when:** tests for each enum value, an unknown value, over-long affiliation number, that the
  existing P.IVA tests still pass with a codice fiscale of an association as the tax id, and a test per
  hardening item above.

### B4 `[x]` Firestore rules (Medium)
- Files: `firestore.rules`, `functions/test/` rules test (emulator pattern of `chat-rules.test.ts`).
- **`users/{uid}`:** `providerType` stays OUT of `isValidUserCreate` / `isValidUserUpdate` — the
  `business_account_exists` guard in `applyAsProvider` is safe only because of that. Add a test that
  pins it. Admin client updates can change it today (only `role`/`permissions` are excluded for
  admins); either accept that or route changes through an audited callable (B8).
- **`instructors` create (owner):** forbid the `business` key entirely. **Update (owner):** the `business`
  map cannot be added or removed (`('business' in new) == ('business' in old)`); `legalName`,
  `vatNumber`, `legalForm` and `affiliationNumber` never change, **including while pending** (otherwise
  the admin reviews a number that isn't the claimed one); `business` keys `hasOnly` the allowed set;
  limits: `displayName` 1–120, `description` ≤ 1000, `city` ≤ 80, `website` null or ≤ 200 chars matching
  `^https?://\S+$` (the owner can otherwise write `javascript:` straight from the client),
  `logoUrl` null or an https string with a length cap. Optional: for business docs `name == fullName ==
  business.displayName`.
- **Admin edits of `business.vatNumber`** must go through a callable that moves the `businessVat` claim too
  (B8) — a plain client write would leave claim and doc out of step.
- **`businessVat/*`:** explicit `allow read, write: if false` plus a test.
- Known neighbouring holes (out of scope, note in the Log if touched): the owner can write
  `instructors.providerProfile.rating/reviewCount`, `name`/`fullName`, `isActive`; and
  `users.providerProfile` (incl. `isVerified`) is on the owner allowlist while `backfillProviderStatus`
  trusts it.
- **Done when:** rules tests: owner edits display field ✔, owner edits P.IVA / legal form ✘ (pending and
  approved), owner adds or removes `business` ✘, `javascript:` website ✘, other user ✘, admin ✔, client
  read/write of `businessVat` ✘, owner write of `users.providerType` ✘.

### B5 `[~]` Signup: individual or company (Large) — code + unit tests done; browser checks at 320/390 px (it, de), 44px targets and inline errors are part of B10
- Files: `src/app/auth/register/RegisterClient.tsx` (both `submitProviderApplication` call sites),
  `src/hooks/useProviderApplication.ts`, `src/lib/firebase/providerApplication.ts`,
  `src/components/profile/BecomeProviderCard.tsx`, new `src/components/provider/BusinessDetailsForm.tsx`
  (React Hook Form + Zod, validator from B1), i18n keys in all five locales.
- Flow: after choosing "professional", a two-option control "Individual / Company or association"; the
  business option reveals legal name, **"P.IVA / Codice fiscale"** (with help text: associations without a
  P.IVA use their codice fiscale), legal form (company / sole trader / association / other), optional
  affiliation number (CONI / RASD / ente di promozione), public name (defaults to legal name), city,
  website. The same control appears in `BecomeProviderCard` for existing customers.
- Map every error code from the B3 log (`invalid_vat`, `vat_already_registered`, `vat_change_not_allowed`,
  `business_account_exists`, …) to localised text. `concurrent_update` ⇒ "try again" (the server already
  retried once). A scheme-less website (`www.…`) is rejected by the server — prepend `https://` in the form.
  The callable also still throws plain-sentence errors for the older checks ("Pick at least one category").
- Use `autoApproved` from the response to choose the pending vs. approved screen.
- Pending state: the existing "application under review" screens are reused; copy for a company mentions
  that the P.IVA is being checked.
- **Done when:** at 320 and 390px, in it and de: no overlap, 44px targets, inline errors for bad P.IVA and
  duplicate P.IVA; a company application ends on the pending screen; an individual still auto-approves.

### B6 `[~]` Company profile editing (Medium) — code + unit tests done; browser checks (owner edits name/logo at 320/390 px, search shows the new name) are part of B10
- Files: provider profile edit (`src/app/(main)/profile/edit/page.tsx` area), reuse
  `BusinessDetailsForm` in "edit" mode with `legalName`/`vatNumber` read-only, logo upload through the
  existing photo upload hook.
- Saves display fields to `instructors/{uid}.business.*` (nested via `updateDoc` with dotted *paths*, which
  `updateDoc` resolves correctly — unlike `set` with merge) and mirrors `displayName` to `name`/`fullName`.
- **Done when:** owner can change public name and logo, search shows the new name after the index trigger
  runs, attempts to change P.IVA are impossible in the UI and rejected by rules (B4).

### B7 `[~]` Public listing and search (Medium)
- Files: `src/lib/firebase/providers.ts` (`flattenProvider` reads `providerType`, `business`),
  provider card and booking-page components, `functions/src/providers/onInstructorWriteSearchIndex.ts`
  (add `displayName` and `legalName` tokens), i18n `provider.badge.business` ("Azienda" in it).
- **Done when:** an approved company shows its name, logo and an "Azienda" badge in `/booking` search and on
  its own page; searching the legal name finds it; individual cards unchanged.

### B8 `[~]` Admin visibility (Medium) — B8a (callables) and B8b (admin UI) code + unit tests done; browser checks are part of B10
- Files: `src/components/admin/providers/ProvidersListView.tsx` (+ test), `ProviderDetailView.tsx`,
  admin store/query for the type filter; a small admin callable `releaseBusinessVat` (superadmin or admin,
  audit-logged) to free a P.IVA claim; `src/components/admin/venues/VenuesListView.tsx` gets a read-only
  "owner" column (empty until phase 3, but the column and field name `ownerUid` are fixed now).
- List: type filter (all / individual / business) and a company badge. Detail: a business block with legal
  name, P.IVA, website, and the existing approve/reject actions. Every mutation writes `audit_log`
  (project policy).
- **Approve what the admin actually saw** (from the B3 re-review): a pending company may change its tax id
  or legal name through `applyAsProvider`, and the admin's approve re-reads the latest doc — so an admin
  looking at number X could approve Y. The approve action sends the `vatNumber` and `legalName` shown on
  screen (or the instructors doc `updateTime`); `commitProviderDecision` refuses with a stale-review error
  on a mismatch and the UI reloads the detail view. Test: swap the tax id between load and approve.
- Also an admin callable `convertBusinessToIndividual` (audit-logged): clears `users.providerType`, deletes
  the `instructors.business` map and releases the claim. Without it, an Italian sole trader who picked
  "Company" by mistake is locked out of the individual path for good (`business_account_exists`).
  Admin changes to `business.vatNumber` go through a callable that moves the `businessVat` claim too.
- **Done when:** admin (not only superadmin) can filter companies, open one, see the tax id, legal form and
  affiliation number and approve it; approval makes it appear in search; release, convert and
  tax-id-change actions work and are audited.

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

- **Phase 2 — Class timetable** (added 2026-10-04; the first real prospect is an ASD whose product is a
  weekly timetable of group classes at ~8 host sites, not one-to-one slots — see the SST Planet
  "palinsesto settimanale"). Needs its own spec before tasks:
  - Data: `instructors/{uid}/classSlots/{id}` = `{ categoryId, title, dayOfWeek, startTime,
    durationMinutes, location: { venueId? | name, address, city, lat?, lng? }, capacity?, price?, coachName?,
    isActive, validFrom?, validTo? }`. Several slots may share a day/time (two classes in one slot) and the
    same class may repeat across locations (Kangoo Jumps in six sites).
  - Entry: a weekly grid editor in the provider area laid out like the poster (times × days, tap a cell to add
    a class). Optional: upload the poster and a callable (Claude vision) returns draft slots the owner
    reviews and corrects — never saved without review.
  - Display: the business page shows the timetable by day; a "classes near you this week" view in search
    (`classSlots` collection-group query, needs an index and public read when the instructor is verified).
  - Booking (later step): capacity, waitlist, per-occurrence reservation.
  - Rules: owner-only writes under their own `instructors/{uid}`, public read only for a verified parent.
- **Phase 3 — Team:** `businessMembers` collection; the owner invites trainers by email; bookings of a
  business service route to a member; per-member availability; the business page lists its team.
- **Phase 4 — Venues:** make `venueStaff` real (schema + admin tool), `venues.ownerUid` + "assign owner /
  manager" in `/admin/venues`, and a venue application path for real partner gyms. This is what finally
  gives admins ownership visibility over the ~130 seeded venues. Host sites in a class timetable can then
  link to a real venue (`location.venueId`).

## 5. Risks and open points

- **`commitProviderDecision` name overwrite** — it sets `name` from the application when one is passed; a
  business must keep `displayName` (covered in B3 tests).
- **Search index trigger** — name changes only propagate when `onInstructorWriteSearchIndex` runs; check
  its idempotency so a logo-only edit doesn't loop.
- **Uniqueness claim vs. rejection** — a rejected company keeps its claim; the admin release action (B8)
  is the escape hatch. If rejections turn out to be common, release automatically on rejection instead.
- **Non-Italian companies** are out of scope (D3); the validator is isolated so a country switch is local.
- **A verified individual applying as a business** drops to pending (they are de-listed until an admin
  reviews the new `business` data) while `users.isVerified` and `role: provider` stay as they were. `[?]`
  decide: allow with a confirmation warning in B5, or refuse with "contact support". Default if nobody
  decides before B5: allow with the warning.
- **Squatting by an unreviewed claim** — a pending claim blocks the real owner of that tax id until an admin
  acts; the B8 release action is the escape hatch, and a pending company may change its own tax id (B3).
- **`concurrent_update`** — the decision (commitProviderDecision), applyAsProvider's pending branch and
  the admin business callables are single transactions that Firestore re-runs on contention (e.g. the
  admin-index trigger writing `users/{uid}` right after signup); `concurrent_update` only surfaces if
  contention outlasts the SDK's retries (B8a review fixes replaced the earlier one-retry wrapper).
- **ASD tax and legal details** — whether an association charges VAT or not is irrelevant to listing; we only
  verify that the tax id exists and matches the legal name. The affiliation number is informational.
- **Legal copy** — the terms/privacy pages don't mention business data; confirm wording with the owner
  before prod (`[?]` if they want a change).
- **Legacy `verifyProvider` audit after the transaction** (B8a re-review m3) — its `verificationLogs` entry,
  template seeding and `audit_logs` entry run after the verification transaction, so a crash in
  between leaves an unaudited change. No client calls it any more: consider deleting the callable
  after phase 1.
- **The admin review covers only `vatNumber` + `legalName`** (m4) — `legalForm` and `affiliationNumber`
  can change by re-applying between the admin loading a company and approving it; extend
  `expectedReview` if they ever matter for the decision.
- **Direct admin client writes bypass I1/I2** (m5) — `firestore.rules` (instructors `allow update: if
  isAdmin()`) lets an admin client set `providerProfile.isVerified` or `business.vatNumber` directly,
  skipping the review and claim checks of the callables. Tighten the admin branch in a follow-up
  (route verification and tax-id changes through the callables only).
- **`deleteUserCascade` deletes claims outside a transaction** (m6) — between Auth deletion and the
  claim delete, the deleted user's still-valid ID token (≤ 1 h) could in theory re-apply and take a
  claim back; the cascade is idempotent and a re-run removes it.
- **Business legal data is public** — Tax id, legal name and affiliation number sit on the public
  instructors doc (readable by anyone once verified; the UI only chooses not to render them).
  Option: move them to an owner/admin-only subdocument `instructors/{uid}/private/business` —
  decide with the product owner (they are public registry data, so exposure is modest).

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
- 2026-10-04 — Plan amended: D3 now accepts an association's codice fiscale (new task B3b: legal form +
  affiliation number); B4 rules constraints and B8 convert/release actions taken from the B3 review; phases
  renumbered — new Phase 2 "Class timetable" (prompted by the SST Planet ASD poster), Team is Phase 3,
  Venues Phase 4.
- 2026-10-04 — B3 review fixes (f849d3e). D2 race closed: commitProviderDecision's self-apply
  path re-checks `business_account_exists` on its own reads and guards its users/{uid} write with
  `lastUpdateTime`; a stale write maps to `aborted`/`concurrent_update`, which applyAsProvider retries
  once (the admin-index trigger also writes users/{uid} right after signup). P.IVA squatting closed: the
  business transaction reads the instructors doc first; a pending/rejected company moving to a new
  P.IVA releases its own old claim, an approved one gets `vat_change_not_allowed` (D6). A re-apply no
  longer resets bio/rating/reviewCount/createdAt. Handler-level tests with a mocked firebase-admin for
  applyAsProvider and commitProviderDecision.
- 2026-10-04 — B3b done (this commit). `business.legalForm` (company / sole_trader / association /
  other, 'company' when absent) and `business.affiliationNumber` (≤ 40 chars, "" when empty), both in
  the nested map. New error codes for B5: `invalid_legal_form`, `invalid_affiliation_number`,
  `business_already_approved`. Hardening: the business transaction reads users + instructors fresh and
  refuses ANY re-apply from an approved business (`business_already_approved`, also the same-number
  case) — a verified *individual* applying as a business is still allowed (§5 default); it then
  queries `businessVat where uid == caller` and releases every claim other than the one being taken.
  That query replaces B3's release-old-claim path, so the client-writable `business.vatNumber` is no
  longer used to find claims at all and can never become a document id ("a/b" ⇒ no `internal`).
  `vat_change_not_allowed` stays only as a backstop inside claimBusinessVat (an approved account holding
  another claim); the handler refuses first, so B5 should not expect it. A codice fiscale of an
  association passes every tax-id test. The applyAsProvider test fake now serves stale outer vs. fresh
  in-transaction reads, refuses a read after a write, only records committed writes, rejects a
  non-document id and enforces `lastUpdateTime`; one test runs the real commitProviderDecision through
  the code-9 retry to `business_account_exists`.
- 2026-10-04 — B4 done (this commit). `firestore.rules`: an owner can't create an instructors doc with
  `business`; on update the map can't be added or removed, `legalName`/`vatNumber`/`legalForm`/
  `affiliationNumber` never change (map `diff()`, so absent→absent passes and adding one is refused —
  also while pending), keys `hasOnly` the nine allowed, and changed display values must fit
  `displayName` 1–120 non-blank, `description` ≤ 1000, `city` ≤ 80, `website` null or `^https?://\S+$`
  ≤ 200, `logoUrl` null or `^https://\S+$` ≤ 500. Only *changed* fields are value-checked, so a value
  the callable already accepted (e.g. an upper-case `HTTPS://` site) never blocks an unrelated edit.
  Admin unchanged (free). `businessVat/{vat}`: explicit deny-all. `users.providerType` confirmed outside
  both owner allow-lists (pinned by tests); admin client writes of it kept, with a comment pointing to
  B8. Tests `functions/test/business-rules.test.ts` (38) **executed** on the Firestore emulator
  (`--project demo-vfit-rules`): all pass; `chat-rules` (26), `booking-rules` (19) and the other 7 rules
  suites (64) still pass; 12 rule mutations each turned at least one test red. Optional
  `name == fullName == business.displayName` not enforced (B6 mirrors them). Neighbouring holes left
  as listed above, plus one for B7: the owner can write `instructors.providerType`, which no server code
  sets — derive the "Azienda" badge from `business` (now locked), not from that field.
- 2026-10-04 — B5 code done (e1d0812). `BusinessDetailsForm` (RHF + Zod, `src/lib/businessDetails.ts`
  mirrors the server limits; P.IVA / codice fiscale via `isValidItalianVat`, sent as bare digits; public
  name defaults to the legal name; `www.x.it` gets `https://`, other schemes and credentials refused,
  scheme lower-cased for the rules' case-sensitive regex; `mode` prop reserved for B6). A sub-form, not a
  `<form>`: the parent calls `validate()` (errors on their fields, focus on the first) and
  `showServerError(code)` through a ref. `ProviderTypeChoice` = native radios in a fieldset (arrow keys,
  ≥44px, stacked below 380px so "professionista" never breaks mid-word), shown after "professional" in
  both register flows (via `ProviderOptInField`) and in `BecomeProviderCard`; the company form stays
  mounted (hidden) so switching back and forth keeps what was typed. `submitProviderApplication` now
  returns the callable's answer and takes `providerType: 'business'` + `business`; an individual's
  payload is still exactly `{ categoryIds, fullName }` (test pins the keys). Every B3/B3b code maps to
  localised text in `src/lib/providerApplicationErrors.ts` (`provider.business.error.*` on a field —
  tax-id codes on the tax id, `invalid_business_name` on the legal name — `provider.applyError.*`
  otherwise, incl. `business_account_exists` / `concurrent_update` for individuals); plain-sentence
  errors keep the generic message. `applicationOutcomeStatus` (in `src/lib/providerStatus.ts`) turns
  `autoApproved` into verified/pending: the card shows it while the reloaded user lags, and the social
  flow routes on it. Pending copy for a company (`provider.card.pending.subtitleBusiness`,
  `provider.banner.pendingBusiness` in the provider layout) says the tax id is being checked.
  Decisions not in the plan: (1) the email flow remembers the account it created, so a retry after a
  failed application (e.g. `vat_already_registered`, fixed inline) re-sends only the application instead
  of failing on "email already in use" — individuals get the same fix; (2) city and website are optional
  (as on the server); (3) the RegisterClient error boxes got `role="alert"`, the card's small buttons
  44px and its open state a real `<form>` (Enter submits); (4) §5 "verified individual applies as a
  business" has no B5 entry point (verified users see the dashboard link, registered users are
  redirected away from /auth/register), so no warning was built — still open for B6/B8. Browser
  verification at 320/390px is deferred to B10 (backend not deployed yet); layout was reasoned from the
  classes (`min-w-0` on fieldsets, `break-words` on labels/hints/errors, inputs 52px, radios 44px).
- 2026-10-04 — B5 review fixes (this commit); B5 stays `[~]` until B10's browser checks. Once the email
  flow has created the account, its fields (name, email, both passwords, birth date, section) are
  read-only with a hint (`auth.register.accountCreatedHint`) and a retry never re-registers — an edited
  password was silently dropped and an edited email created a second account. The "already registered"
  redirect also skips once this form created the profile, so a late profile reload after a failed company
  application no longer carries the user off to /profile. The slow-profile fallback now writes the
  callable's outcome (`providerStatus`, and `providerType: 'business'`) into the auth store before
  routing, in both flows — the provider layout reads the store and would otherwise bounce to /profile.
  `normalizeWebsite` checks format only; the schema caps the normalised address at 200 with its own
  message (`provider.business.error.websiteTooLong`) and the input has no maxLength. The form's
  onChange/subscribe plumbing is gone (B6 adds what it needs); its field-message set is derived from
  `BUSINESS_FORM_ERRORS` + the code map, the enum from `BUSINESS_LEGAL_FORMS`; signup and card share
  `reportProviderApplicationError`. The form owns focus (after a render that shows it enabled), so
  the parents mark themselves busy before the async company check — no double submit. Card start
  button 44px. New `src/lib/businessDetails.test.ts` (website rules, every length limit).
- 2026-10-04 — B6 code done (this commit); B6 stays `[~]` until B10's browser checks. New
  `BusinessProfileSection` at the top of the Professional tab of `/profile/edit`, shown only when
  `users.providerType === 'business'` (the auth store spreads the whole users doc, so the field
  already arrives) AND `instructors/{uid}.business` exists (read by its own query,
  `fetchBusinessDetails` — `flattenProvider` is left to B7). `BusinessDetailsForm` `mode="edit"`
  (new props `defaultValues`, `reviewStatus`, `logo`, `onDirtyChange`; handle `validateChanges` /
  `markSaved`): legal name, tax id, legal form and affiliation number as a read-only definition
  list with "verified by our team / being checked — contact support to change them"; public name
  (now required, `businessEditSchema`), city, website, description editable. Save =
  `updateBusinessDisplayFields`: `updateDoc` with `business.<key>` field paths for the changed
  keys only (compared after normalising, so an untouched field is never sent), `name`/`fullName`
  mirrored when the public name changes, `updatedAt`; an allow-list (`BUSINESS_OWNER_EDITABLE_KEYS`)
  means a reviewed key or the whole map can't be sent. §0 nested-flag rule: the no-dot test does
  not apply to this write — dotted paths are correct for `updateDoc`; the tests instead pin
  `updateDoc` (never `setDoc`) and the exact keys. `users.fullName` untouched. Logo: uploaded with
  `uploadGalleryPhoto` to `instructors/{uid}/gallery/` (storage.rules already allow owner image
  writes there, so no rule change), checked to be an https URL ≤ 500 (the emulator's
  `http://127.0.0.1:9199` URLs are refused with the upload error), stored on save; "Remove logo"
  saves null. Every save failure (incl. `permission-denied`) shows one localised message.
  `onInstructorWriteSearchIndex` indexes `fullName`, so the mirrored name reaches search; a
  logo-only edit leaves the terms unchanged and the trigger writes nothing. Decisions not in the
  plan: (1) the section has its own "Save business details" button AND the page's floating Save
  saves it first when it has edits (an invalid field or failed write stops the page save and
  switches to the Professional tab); its edits count in the page's unsaved-changes guard; the
  section stays mounted (hidden) on the Personal tab so edits survive a tab switch, and the form
  defers focusing an error while hidden. (2) Shown to pending companies too, with the "being
  checked" note — the rules lock the reviewed keys while pending anyway. (3) Replaced logos are
  not deleted from Storage (cards/search may still point at the old URL until reload); orphans
  are harmless. (4) The page's Back button got an `aria-label`. Tests: section (24), form edit
  mode (3), lib (11 + 7), page wiring with the section stubbed (6).
- 2026-10-04 — B7 code + unit tests done (this commit); B7 stays `[~]` until B10's browser checks. New
  `src/lib/publicBusiness.ts` (`readBusinessDetails`, `toPublicBusiness`, `safeHttpUrl`): a `business`
  map is valid iff it is a plain object with a non-empty trimmed `displayName`; legal fields coerce to
  "", optional fields kept only when correctly typed, `website`/`logoUrl` only when http(s). The badge
  is derived from that map only, never `providerType` (owner-writable). `flattenProvider`,
  `providerSearchResultFromDoc` and `toProviderPublicProfile` add `isBusiness`/`business`/`logoUrl`
  only for companies (individuals get no new keys); the search result and public profile carry the
  public subset only (no legal name, tax id, legal form or affiliation number). `/booking` cards and
  `/providers/detail` show the "Azienda" badge (`provider.badge.business`, text + icon, same label
  for every legal form), the logo as avatar, and on the page the description and website
  (`BusinessWebsiteLink`: target _blank, rel noopener noreferrer, scheme re-checked at render, sr-only
  "opens in a new tab" via `providerProfile.business.websiteNewTab`). `searchTerms` now also indexes
  `business.displayName` and `business.legalName` (not tax id / affiliation number); the existing
  `sameTerms` guard keeps a logo/description edit write-free. The client's `searchTerms
  array-contains` query finds a company by legal name while cards only show the public name.
  Not covered: home page trainer cards (no badge/logo yet); existing companies need
  `scripts/backfill-provider-search.mjs` (or any write) before legal-name search finds them.
- 2026-10-05 — B8a done (this commit) — the backend half of B8; B8 stays `[ ]` until the admin UI
  (B8b). **Approve what was reviewed:** `decideProviderApplication` takes `expectedReview?: {
  vatNumber, legalName }`; `commitProviderDecision` runs `checkBusinessReview` (pure, new
  `businessAdminRules.ts`) on its OWN instructors read: approving a doc with a `business` map
  without it ⇒ `failed-precondition`/`review_required`, tax id (normalised) or legal name
  (trimmed, case-sensitive) different ⇒ `stale_review`, nothing written. No window between check
  and write: the batch gets a guard `update({updatedAt})` on instructors with that read's
  `lastUpdateTime`, placed before the unchanged `set(merge)` (WriteBatch.set takes no
  precondition; one Commit RPC is atomic and ordered and allows several writes to one doc), and a
  guard failure maps to `stale_review` (not the retryable `concurrent_update`). Rejections and
  individuals need no review (one sent is ignored). **New admin callables** (`businessAdmin.ts`,
  admin or superadmin, one transaction each, all reads first, audit entry in the same
  transaction): `releaseBusinessVat({vatNumber, reason?})` (audit entity `business_vat` /
  `delete`, new in both audit vocabularies), `convertBusinessToIndividual({providerId, reason?})`,
  `updateBusinessTaxId({providerId, vatNumber, legalName?, legalForm?, affiliationNumber?,
  reason?})` (both `provider` / `update`). New error codes for B8b: `review_required`,
  `stale_review`, `claim_not_found` (not-found), `claim_in_use`, `not_a_business`,
  `provider_not_found` (not-found), `invalid_provider_id`, `invalid_reason` (non-string or > 1000
  chars); reused: `invalid_vat`, `invalid_business_name`, `invalid_legal_form`,
  `invalid_affiliation_number`, `vat_already_registered`. The signup validators are now exported
  (`parseVatNumber`, `parseLegalName`, `parseLegalForm`, `parseAffiliationNumber`) and
  `updateBusinessTaxId` uses them; `claimBusinessVat` gained `byAdmin` (skips only the
  `vat_change_not_allowed` backstop — an admin may move an approved company). Typed wrappers +
  request/response types in `src/lib/firebase/functions.ts`; docs in `docs/backend/cloud-functions.md`
  and `docs/database-schema.md`. Decisions not in the plan: (1) `releaseBusinessVat` treats a
  holder doc without `applicationStatus` as in use, and a claim whose `uid` can't name a doc as
  abandoned; (2) `convertBusinessToIndividual` also deletes a denormalised `instructors.providerType`
  if present, needs the users doc (`provider_not_found`) and refuses a protected superadmin;
  (3) `updateBusinessTaxId` requires the instructors `business` map (users.providerType alone is
  `not_a_business`), releases EVERY other claim of the uid (the B3b uid query, not just the stored
  number's), keeps the approval state, and still writes (fields + audit) when nothing changed;
  `null` resets `legalForm`/clears `affiliationNumber` like signup. **Deploy note:** the current
  admin UI (`verifyProvider` in `src/lib/firebase/admin.ts`, `ProviderApplicationsPanel`) sends no
  `expectedReview`, so approving a company returns `review_required` until B8b — deploy these
  functions together with B8b (B11), never alone. Tests: `businessAdminRules.test.ts` (21),
  `businessAdmin.test.ts` (32, strict transaction fake: read-after-write throws, commit-only
  writes, delete sentinel, invalid doc ids throw), `commitDecision.test.ts` (4 → 11, versioned
  `lastUpdateTime` fake), `businessApplication.test.ts` (+5); providers suite 156 → 221. 20
  mutations (no stale check, no guard, null instead of delete, claims kept, read after write, no
  claim_in_use, dotted keys, byAdmin ignored, no admin check, …) each turned at least one test red.
- 2026-10-05 — B8b done (this commit); B8 stays `[~]` until B10's browser checks. **Approve what
  was seen:** every approve path sends `expectedReview` for a company — `verifyProvider` (lib, via
  `VerificationData.expectedReview`; the store passes it through unchanged) from the provider page
  and the verification queue, and `ProviderApplicationsPanel` directly; individuals' payloads are
  unchanged (tests pin the exact keys). The values come from the instructors doc's `business` map
  on screen: new `readAdminBusiness` (`src/lib/admin/providerBusiness.ts`, any object counts as a
  company like the server's `businessOf`, tax id and legal name kept verbatim) behind
  `useAdminProviderBusiness` (`queryKeys.adminProviderBusiness(id)`, under `adminProvider(id)`).
  Approve waits for a fresh read (`isFetching`). `stale_review` / `review_required` show the
  localised text (`role="alert"`) and reload: the detail view invalidates the provider, the queue
  page refetches the queue and `['providers']`, the panel refetches the applications. **List:** new
  derived admin-index field `providerKind` ('business' | 'individual' for providers/applicants, null
  otherwise; both byte-identical `adminIndex.ts` copies) because individuals carry no `providerType`
  for an equality filter; `providerListConstraints` adds `providerKind ==`; URL `?type=`; 4 new
  composite indexes in `firestore.indexes.json` and the shapes in `verify-admin-list-indexes.mjs`.
  **Existing users docs get `providerKind` only on their next write** — B11 must deploy the
  trigger + indexes, then run `scripts/backfill-search-tokens.mjs --apply` (now counts the field),
  or the "individuals" filter misses older providers. Company badge = `BusinessBadge` (text + icon)
  from `users.providerType`, which is server-written only. **Detail:** `BusinessReviewCard` (legal
  name, tax id, legal form, affiliation number, public name, city, safe website link, description,
  logo) and `BusinessAdminActions`: change tax id / legal data (form prefilled, client-validated
  with the signup rules, sends all four fields — tax id as bare digits, empty affiliation as null),
  release claim (offered only for a rejected company), convert (warning); each in a `Modal`
  (focus trap, Escape/backdrop blocked while running) with an optional reason ≤ 200 chars, server
  codes mapped through the new `ADMIN_BUSINESS_ERRORS` in `providerApplicationErrors.ts`
  (`vat_already_registered` gets an admin-specific text), refresh after success. **Venues:** read-only
  "Owner" column (uid, "—" + sr-only "no owner" when absent — every venue today); `Venue.ownerUid?`
  reserved in the type and the schema doc. **Legacy `verifyProvider` callable** refuses a company
  (business map or `users.providerType === 'business'`) with `failed-precondition` /
  `use_decide_provider_application` before any write. Decisions not in the plan: (1) the owner
  column shows the uid, not a name (a users read per row for an always-empty column); (2) the
  shared `FilterBar` labels are now tied to their selects (`useId`), so the new filter is
  announced; (3) the legacy guard also refuses un-verifying a company (decideProviderApplication
  can reject); (4) a company whose `business` map has no public name gets no review from the
  panel (the public reader drops it) — the server answers `review_required`, whose text sends the
  admin to the provider page, which reads the raw map. Tests: provider page 14, queue page 5,
  panel 5, list 9 (+3), venues 2, lib verifyProvider 4, providerBusiness 6, adminIndex +11,
  getProviders +2, list query +1, error mapping +16 (web gate 93 → 99 files, 724 → 793 tests, all
  green); functions roles.verifyProvider 4 and admin-index trigger +2 (providers + users 359 → 365).
  Mutations (no expectedReview on the page / the queue / the panel, no reload on stale_review in
  the page / the panel, no legacy guard) each turned a test red; the queue page's extra
  `['providers']` invalidation is belt-and-braces (a reopened row refetches anyway).
- 2026-10-05 — B8a backend review fixes (this commit), from an adversarial review of 69129c0 +
  the functions part of 554e1e7 (two confirmed invariant breaks). **I1 — no company listed
  unreviewed:** `commitProviderDecision` is now ONE Firestore transaction (reads: users,
  instructors, the `businessVat` claim for a company approval, `services limit(1)`; every guard
  from those reads; then the users update, instructors set(merge) with nested maps, draft services
  and the audit entry). Firestore re-runs it when anything it read changes before the commit, so
  the review gate can't fail open: an individual who applies as a company while an admin approves
  them ends in `review_required` on the re-run; the B8a `lastUpdateTime` guard write,
  `isFailedPreconditionError` and applyAsProvider's `retryOnceOnConcurrentUpdate` are gone
  (`concurrent_update` now means "contention outlasted the SDK's retries", ABORTED → same code).
  `checkBusinessReview` uses isExistingBusiness (m1: `users.providerType` alone counts), and a
  review sent for a doc that is not (any more) a company is `stale_review` whatever the decision
  (a sent review must describe the doc; without one, rejections/individuals pass as before).
  The search-index/admin-index triggers writing mid-approval now only cause a passing re-run — no
  spurious `stale_review` (m4, documented in the code). A provider deleted mid-flight ⇒
  `not-found` / `provider_not_found` (was "Provider not found"). **I2 — one tax id, one holder:**
  approving a company requires that `businessVat/{its normalised tax id}` names it, read in the
  same transaction — `claim_missing` (new code) or `vat_already_registered`; a stored number that
  matches the review but is no valid tax id ⇒ `claim_missing`. `releaseBusinessVat` treats a
  holder as in use when not rejected OR approved by `isApproved` (now exported); `updateBusinessTaxId`
  also queries `instructors where business.vatNumber == N` (automatic index) and refuses when
  another doc carries N even without a claim. **Legacy `verifyProvider`:** guard + users update +
  instructors write in one transaction. **m2:** convert's protected-superadmin refusal is
  `permission-denied` / `protected_account` (new code). **m3:** `deleteUserCascade` deletes the
  uid's `businessVat` claims (`deleteBusinessVatClaims` dep). New codes mapped in
  `ADMIN_BUSINESS_ERRORS` with it/en/es/fr/de text (`admin.business.error.claimMissing`,
  `.protectedAccount`) and in the wrapper docs; callable names/inputs unchanged. Tests: a shared
  stateful fake `functions/test/fakes/fakeFirestore.ts` (applies commits, re-runs a transaction on
  contention like the SDK — 5 attempts then code 10 — read-before-write, `create` on an existing
  doc / `update` on a missing one fail the whole commit, `beforeCommit` interleaving hook) now
  backs commitDecision (22), businessAdmin (35), applyAsProvider (15), roles.verifyProvider (5),
  deleteUserCascade (8) and the new `businessLifecycle.test.ts` (8 multi-call sequences: the exact
  S1 squatter sequence, its updateBusinessTaxId variant, release → re-apply → approve-old-holder,
  release → admin re-assigns the own number → approvable,
  S2 with a real nested company application inside the admin's commit, a review gone stale by a
  conversion, convert-frees-the-number, re-apply-with-another-number), each checking "one listed
  company per tax id, holding its claim". providers + users 365 → 395; functions 859. 13 mutations
  (no claim requirement — S1 sequence red too; non-business review ignored; read after a write;
  missing/foreign claim accepted; release ignoring isApproved; no carrier check; review gate
  ignoring providerType; protected message; cascade keeping claims; non-transactional reads in the
  legacy callable, the decision's instructors read and its claim read) each turned tests red.
  Decisions beyond the review: the claim requirement does not apply to rejections; a sent review
  is checked on rejections too; updateBusinessTaxId onto the company's own (released) number
  re-creates its claim, which is how an admin makes a `claim_missing` company approvable again.
- 2026-10-05 — UI review fixes (B6/B7/B8b): badges wrap at 320px, page Save explains a busy section, admin sees the full website URL, focus survives Convert (buttons 44px), public `Provider.business` is the public subset and the applications panel reads through `readAdminBusiness`, unknown legal form is not overwritten, rejected companies get their own note, owner's public-profile cache is invalidated, review_required copy on the provider page, one legal-form list/label map (this commit).
- 2026-10-05 — B8a backend re-review fixes (this commit; re-review of 8efef3a: approved with one
  Important). **Important:** `updateBusinessTaxId` ran the other-carrier check even when the number
  was not changing, so after the S1 recovery (squatter rejected + released, owner approved on X) the
  owner's legal name could not be corrected (carriers = [squatter, owner] ⇒ refused, and Release then
  refuses too). `assertTaxIdAvailable` (replaces `assertNoOtherCarrier`) now: another account's claim
  ⇒ `vat_already_registered`; an unchanged number (normalised compare) ⇒ passes, claimBusinessVat
  still guards the claim; otherwise another carrier ⇒ the new stable code `vat_carried_by_other`
  (admin text in it/en/es/fr/de: convert that company or change its number first). **m1:**
  `concurrent_update` is in `ADMIN_BUSINESS_ERROR_CODES` (`admin.business.error.concurrentUpdate`,
  5 locales); commitProviderDecision's protected-superadmin refusal is `protected_account`; the three
  admin business callables and applyAsProvider's pending transaction map exhausted contention
  (code 10) to `aborted` / `concurrent_update` instead of `internal`; the stale "retried once"
  comment in `providerApplicationErrors.ts` is fixed. **m2:** applyAsProvider's pending branch is one
  transaction for individuals too — it re-reads users + instructors, re-checks
  `business_account_exists`, and judges "doc exists" (profile defaults, createdAt) on its own read; a
  missing users doc is a clean `not-found` instead of `internal`. **m7:** `decideProviderApplication`
  and legacy `verifyProvider` use `parseProviderId` (`invalid_provider_id` for "a/b", "" or none).
  §5 gained the skipped items m3–m6 and the "business legal data is public" option; its
  `concurrent_update` bullet now describes the transactions. Tests: the exact S1-recovery
  legal-name correction (lifecycle + handler), a genuine other carrier ⇒ `vat_carried_by_other`, an
  unchanged number whose claim another account holds ⇒ `vat_already_registered`; races (approval vs
  a second approval — both pass, one audit entry each, drafts seeded once; vs updateBusinessTaxId ⇒
  `stale_review`; vs convertBusinessToIndividual ⇒ `stale_review`; vs a release ⇒ `claim_missing`);
  reverse S2 (the individual's approval commits first, the company application re-runs to pending
  with its claim held); pending-individual contention and stale-existence tests; contention ⇒
  `concurrent_update` for the three admin callables and the company transaction; `invalid_provider_id`
  in both decision callables. providers + users 395 → 414; functions 859 → 878; error-map test
  40 → 42. 11 mutations (carrier check also on an unchanged number; no carrier check; old code for
  the carried case; claim check dropped from assertTaxIdAvailable; un-normalised compare; pending
  individual not re-checked; stale existence read; no parseProviderId ×2; contention leaked ×2) each
  turned tests red. Touched in `src/` beyond the error map and locales: `providerApplicationErrors.test.ts`
  (pins the admin code list) and doc comments of the wrappers in `src/lib/firebase/functions.ts`.
- QA layout fixes (B10): legal-form option labels shortened in all 5 locales (+ `px-3 truncate` on the select) so the closed select is not clipped at 320-390px; venues Owner column sr-only text now inside a `relative` wrapper (page no longer wider than the viewport, test added); FilterBar search, select and date controls `min-h-11` (44px touch targets). (this commit)
