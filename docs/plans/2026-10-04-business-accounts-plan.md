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

### B4 `[ ]` Firestore rules (Medium)
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

### B5 `[ ]` Signup: individual or company (Large)
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
- **`concurrent_update` retry** — `applyAsProvider` retries the auto-approval once because the admin-index
  trigger writes `users/{uid}` right after signup; the retry re-reads and re-checks the business guard.
- **ASD tax and legal details** — whether an association charges VAT or not is irrelevant to listing; we only
  verify that the tax id exists and matches the legal name. The affiliation number is informational.
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
