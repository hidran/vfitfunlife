# Staging environment

**Project:** `vfit-app-staging` (project number `685675760163`)
**URL:** https://vfit-app-staging.web.app
**Production:** `vfit-funlife` — https://vfit-funlife.web.app

Created 2026-08-14. Until then everything deployed straight to production.

## Why a second project rather than a second database

Firestore rules, indexes, Auth users, Storage, Remote Config and Cloud Functions secrets are
all **per project**, not per database. A separate Firestore database inside `vfit-funlife`
would still share the rules you want to test, the Auth users you want to fake, and the
Stripe secret you want to keep live-key-free. Only a second project isolates all of it.

## Layout

| | production | staging |
|---|---|---|
| Project | `vfit-funlife` | `vfit-app-staging` |
| Alias | `production` | `staging` |
| Env file | `.env` | `.env.staging` |
| Build | `npm run build:prod` | `npm run build:staging` |
| Deploy | `npm run deploy:prod` | `npm run deploy:staging` |
| Stripe | live keys | **test keys only** |
| Data | real users | synthetic, from the seeders |

`.firebaserc` previously aliased `production` to `vfit-app-prod`, a project that has never
existed. It now points at `vfit-funlife`.

## Every deploy script names its target

```json
"deploy:prod":             "npm run build:prod && firebase deploy -P production --only hosting,firestore,storage",
"deploy:staging":          "npm run build:staging && firebase deploy -P staging --only hosting,firestore,storage",
"deploy:staging:functions":"firebase deploy -P staging --only functions",
"deploy:functions":        "firebase deploy -P production --only functions"
```

The explicit `-P` matters. Without it a deploy follows whatever `firebase use` last
selected, so running `deploy:hosting` after a staging session would push to staging — or a
staging bundle to prod. Each script also rebuilds, because `NEXT_PUBLIC_*` config is baked
into the bundle at build time: deploying `out/` without rebuilding ships whichever project's
config was compiled in last.

## Production builds load `.env` explicitly

A plain `next build` lets `.env.local` override `.env`. With `.env.local` pointed at staging
for local development, `npm run build` compiles the **staging** config — and on 2026-09-19
that bundle went live on `vfit-funlife.web.app`. The site talked to the staging backend, and
Google sign-in failed with `auth/unauthorized-domain` because staging does not authorize
`vfit-funlife.web.app`.

`build:prod` is `dotenv -e .env -- next build`. Next.js never overrides a variable that is
already in `process.env`, so `.env` wins no matter what `.env.local` contains — the same
mechanism `build:staging` uses. `mobile:build` runs `build:prod` too, so native builds
cannot pick up staging config either.

The hosting `predeploy` hook runs `scripts/assert-build-project.mjs "$GCLOUD_PROJECT"`. It
scans `out/_next/static` for the inlined `projectId` and cancels the deploy unless it
matches the target project. That covers every path, including a bare `firebase deploy`.

## One-time setup (done)

- Project created, web app registered, `.env.staging` written with the staging SDK config
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` left empty — staging traffic in the production
  Analytics property would corrupt the numbers
- `.env.staging` added to `.gitignore`

## What is provisioned

| Piece | State |
|---|---|
| Firestore | `europe-west1`, rules + indexes deployed |
| Functions | 88 deployed, identical set to production |
| Hosting | https://vfit-app-staging.web.app |
| Auth | Email/Password + Google enabled; `localhost` authorized for local dev |
| Remote Config | pilot flags published (version 1) |
| Secrets | all 8 exist, as **placeholders** |
| Storage | **not provisioned** — see below |
| Data | 320 instructors, 964 services, 120 venues, 91 exercises, 29 categories, 10 user types |

### Accounts

| Email | Password | Role |
|---|---|---|
| `admin@vfit.com` | `StagingAdmin!2026` | superadmin |
| `demo.trainer@vitfitdemo.dev` | `VfitDemo!2026` | provider (verified) |

Staging-only credentials. They share emails with production accounts but are separate
users in a separate Identity Platform tenant, with different passwords.

## Still needs a human

1. **Storage.** The `.firebasestorage.app` bucket domain is Google-owned, so neither the
   CLI nor the API can create it — `gcloud storage buckets create` fails with "Another user
   owns the domain". One click:
   https://console.firebase.google.com/project/vfit-app-staging/storage
   Then `firebase deploy -P staging --only storage` to push the rules. Until then, avatar
   and gallery uploads will fail on staging.
2. **Stripe test keys.** Every secret below is a placeholder, so payment calls fail with a
   Stripe auth error — deliberately, rather than risking a live charge:
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY     -P staging   # sk_test_...
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET -P staging   # whsec_...
   ```
   Also set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...` in `.env.staging`.
   Redeploy functions afterwards so they pick up the new versions.
3. **Apple / Phone sign-in**, if you need them. Email/Password and Google are enabled;
   the seeded accounts use Email/Password. Google was enabled on 2026-09-19 with a one-off
   `firebase deploy -P vfit-app-staging --only auth --config <file>` whose only content is
   an `auth.providers.googleSignIn` block. It is kept out of the shared `firebase.json` so a
   bare prod deploy never re-provisions production's Google client.
   https://console.firebase.google.com/project/vfit-app-staging/authentication/providers
4. **AI and email keys**, if you want those features working. `RESEND_API_KEY`,
   `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENAI_API_KEY`, `OPENAI_COMPAT_API_KEY`
   and `OPENAI_COMPAT_BASE_URL` are placeholders. `email.ts` already logs and skips when the
   key is unset, so nothing crashes — staging simply sends no mail, which is usually what
   you want.

5. **Web push (FCM) VAPID key**, per project. Firebase console → Project settings → Cloud
   Messaging → Web Push certificates → *Generate key pair*, then put the public key in the
   env file that builds for that project and rebuild:
   `NEXT_PUBLIC_FIREBASE_VAPID_KEY=<key>` in `.env.staging` + `.env.local` (vfit-app-staging)
   and in `.env` (vfit-funlife). Without it the client skips web-push registration (dev
   console warning); native iOS/Android tokens are unaffected. The service worker
   (`public/firebase-messaging-sw.js`) needs no per-project edits — the app passes the
   Firebase config to it as query parameters when registering it.

## Re-seeding

```bash
# from scratch, in this order — categories and user types before providers
seedServiceCategories → seedUserTypes → seedExerciseLibrary → seedDemoData
→ backfillServiceCategories {"apply":true}
```

`seedServiceCategories` is available to active admins and superadmins; the remaining seed
callables are superadmin-only. They are called at
`https://europe-west1-vfit-app-staging.cloudfunctions.net/<name>` with a Firebase ID token
for an authorized account (the staging superadmin is `admin@vfit.com`). `clearAllData` wipes
demo content so the environment can be rebuilt freely — that is the point of it.

The demo seeder predates the service taxonomy, so its services carry no `categoryId`.
Run `backfillServiceCategories` after seeding or category search returns nothing.

## Gotchas found while building this

- **Firestore location is permanent, and staging deliberately does NOT match production.**
  Production is in `nam5` (US) while its functions run in `europe-west1`, so every
  function-to-Firestore call crosses the Atlantic. Staging is in `europe-west1`, co-located
  with its functions. Staging is therefore faster than production by design — worth
  remembering before reading anything into a latency measurement taken here. Fixing
  production would require a data migration.
- **The Firestore create API lies about "Database already exists"** when the project has no
  database at all; `firebase firestore:databases:create` works and reports the truth.
- **Deploying 88 functions at once exceeds the per-minute mutation quota.** Four trigger
  functions failed on the first pass and succeeded on an immediate retry. Not a real
  failure — just re-run the deploy.
- **New gen-2 callables 401 for several minutes** after first deploy, from both the
  `cloudfunctions.net` and `run.app` URLs, despite correct `allUsers`/`run.invoker` IAM. It
  clears on its own — don't go debugging permissions that aren't broken.
- **Hosting caches `/_next/static/**` as immutable.** After deploying, a browser holding an
  old bundle will keep running it. Hard-reload before concluding a fix didn't work.

## Group courses release — 2026-10-06

Group courses are deployed to `vfit-app-staging` at `/courses/` and
`/provider/courses/`. Hosting was built with `npm run build:staging`; the deployment
project guard passed. Firestore rules/indexes and these 17 scoped functions were deployed:
`saveCourse`, `previewCourse`, `enrollInCourse`, `cancelCourseEnrollment`,
`recordCoursePayment`, `manageCourseSession`, `cancelRemainingCourse`,
`confirmCourseRefund`, `createCourseCheckout`, `courseStripeWebhook`,
`maintainCourseEnrollments`, `remindCourseParticipants`, `onCourseNotification`,
`onCourseProviderEligibility`, `setPaymentSettings`, `createBooking`, and
`createBookingAsTrainer`. Existing remote indexes omitted from the local configuration
were preserved. Unrelated working-tree changes were retained; no production deployment
was performed.

Validation:

- Full frontend suite: 133 files / 843 tests passed.
- Full backend suite: 91 files / 981 tests passed with Firestore emulator and
  `GCLOUD_PROJECT=demo-vfit-test`. After the browser-discovered cancellation fix,
  all 16 course integration tests passed, including the new archive regression.
- Frontend staging build, TypeScript, backend lint/build and course frontend lint passed.
  Repository-wide frontend lint has an existing unrelated synchronous-setState error in
  `MetricsClient.tsx`; course files pass lint.
- Staging API smoke: provider preview/publication, public discovery, single lesson,
  idempotent replay, whole-course all-or-none capacity, concurrent last seat, duplicate
  membership, direct payment, private roster denial, cancellation/refund reconciliation,
  rescheduling, remaining-course cancellation and disabled Stripe/escrow requests.
- Playwright browser smoke: provider creates/previews/publishes a three-lesson course;
  customer books the €40 series; provider records cash payment; customer sees Paid and
  cancels one lesson, creating a €13.34 direct-refund obligation. Checkout controls remain
  hidden. Mobile viewport 390×844 and desktop 1280×900 were inspected; provider mobile
  document width equals viewport width.

Repeat the API checks from the repository root:

```bash
node scripts/smoke-group-courses-staging.mjs
```

The script enforces the staging project, uses documented demo accounts (environment
variables can override them), creates synthetic courses and leaves one published demo
for browser QA. It never changes payment switches. Evidence is written to
`output/playwright/group-courses-staging-smoke.json`; browser screenshots are stored
beside it as `course-*.png`. The script contains no authentication tokens in its output.
Use `/auth/login/` to enter staging; its existing allowlist gate redirects signed-out
visitors on other routes to production.

`stripePaymentsEnabled` and `courseCheckoutEnabled` remain false. Hosted checkout,
signed webhooks, expiry and refund reconciliation have automated coverage; actual Stripe
sandbox charges were not attempted because staging secrets remain placeholders. Configure
test secrets and the `courseStripeWebhook` endpoint before an admin enables both switches.
Checkout records provider liabilities; automatic payouts and customer-selectable VFit
escrow remain future work. See the [course user journeys](../user-journeys/group-courses.md).

### Course editor fixes — 2026-10-06

Creation now opens `/provider/courses/create/`, and editing opens
`/provider/courses/edit/?id=…`. The form is a full page. Draft values are saved in
`sessionStorage`, scoped to the signed-in provider and course, and cleared only after a
successful save. Category selection is a typeahead combobox with locale-aware alphabetical
sorting, accent-insensitive filtering, and arrow/Enter/Escape controls.

Preview validates required form inputs first. Server validation now returns structured
field names for schema, pricing, weekdays, timezone and DST errors; the editor renders
translated field guidance and never raw validation JSON. Verification: 8 course UI tests,
30 backend course tests, scoped frontend lint, backend lint/build and staging build passed.
Deployment includes staging hosting plus `saveCourse` and `previewCourse`.

Staging browser smoke passed in Italian: dedicated create/edit navigation; all 67 category
labels sorted by translated name; typed search and arrow/Enter selection; outside-click
and reload draft preservation; required-field validation; three daily preview dates;
create/edit saves; creation draft cleared after save. The invalid-pricing check displayed
“Controlla questi campi: Prezzo per lezione (€), Prezzo intero corso (€).” with no JSON or
literal placeholders. Evidence: `output/playwright/course-editor-staging-smoke.json`,
`course-editor-route-mobile.png`, and `course-editor-validation-mobile.png`.

### Annual weekly preview explanation — 2026-10-06

Verified the reported 2026-10-08 → 2027-10-07 range against staging `previewCourse`:
Monday-only produces 52 lessons, Thursday-only 53; Monday+Wednesday hits
`maximum_100_sessions`. The dates and Europe/Rome 18:00 are valid. Hosting now displays
a specific translated explanation of the 100-lesson limit and suggests fewer weekdays,
a longer repeat interval or an earlier end date. Verified the Italian browser displays
this explanation with two weekdays and successfully previews 52 lessons after deselecting
Wednesday. No course was saved during this check. Nine course UI tests and ten core tests,
staging build and scoped frontend lint passed. Evidence:
`output/playwright/course-annual-date-smoke.json` and `course-annual-limit.png`.

### Annual course support — 2026-10-06 (supersedes the lesson-limit note above)

The 100-lesson cap is removed from generation and explicit cancellation selection. Annual
weekly schedules with multiple weekdays, annual daily schedules and leap years are
supported. The existing three-year date-span bound remains. Long cancellation-notification
IDs are hashed to remain within document ID limits. Refund allocations are calculated once;
zero-cent allocations release seats without generating invalid zero-amount refunds. Stripe
refund recovery paginates beyond the first 100 external refunds.

Verification: 34 backend course tests and 8 course UI tests passed, including annual
365-lesson competing last-seat reservations, full payment/cancellation and exact refund
allocation, leap-year generation, zero-cent Stripe allocations, and second-page Stripe
refund recovery. Backend lint/build, scoped frontend lint and staging build passed.
Hosting and affected course functions deployed to staging.

Staging API smoke passed for the reported 104-lesson weekly schedule and a 365-lesson daily
course: publication, concurrent series reservation, payment, full explicit cancellation,
€600 total refund, refund reconciliation and QA archiving. Italian browser smoke previews
104 lessons for 2026-10-08 through 2027-10-07 with Monday/Wednesday selected and shows no
100-lesson warning. Evidence: `output/playwright/course-year-staging-smoke.json` and
`course-annual-104-lessons.png`. Repeat the release's API verification with
`node scripts/smoke-annual-courses-staging.mjs` while its published start dates remain future.
Stripe checkout stays disabled; sandbox charges require configured test secrets.

Firestore transactions retain atomic series reservations for these larger schedules.
The obsolete 500-write count cap was removed by Firestore; current limits include request
size and transaction duration. See [Firestore release notes](https://docs.cloud.google.com/firestore/docs/release-notes)
and [current quotas](https://firebase.google.com/docs/firestore/quotas).

### Provider-managed course participants — 2026-10-06

Providers can add linked clients to a future lesson or full course, or create a participant inline with full name/email and optional surname/phone. Existing normalized-email accounts are reused, and the `clients` collection holds independent provider/user pairs. Invited account completion retains the same UID, bookings and every provider link. Providers can explicitly request email delivery or prepare SMS/WhatsApp composers; phone messages contain no Auth credential.

The staging release includes `enrollCourseParticipant`, `notifyCourseParticipant`, updated `enrollInCourse`, `createClientAccount`, `addClientByEmail`, `resendClientAccountEmail`, `syncEmailVerification`, and `onCourseNotification`, plus hosting and client-pair identity protection in Firestore rules. Stripe remains admin-gated and provider-created enrollments use direct payment. Email delivery requires a working Resend secret; staging placeholders return an honest failure. Phone delivery uses the provider’s device, not an automatic SMS gateway.

Validation: 856 frontend tests and 998 backend tests passed. Run backend tests with `GCLOUD_PROJECT=demo-vfit-test FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run --no-file-parallelism`; older suites share emulator data and need a clean emulator. Targeted course tests cover ownership/pair enforcement, private invitation recipients, credential-free phone links, invited-account activation, identity reuse, and course-capacity retries. Review caught and resolved cached identity reuse after editing a failed participant form. The second provider’s new relationship retains the invited badge until activation.

Repeat API smoke with `node scripts/smoke-course-participants-staging.mjs`. It uses synthetic recipients only, creates/archives a QA course, and privately exercises password setup through Firebase’s admin API using `gcloud` credentials and the staging quota project. Setup credentials/passwords are never saved in evidence. Browser evidence: `output/playwright/provider-add-course-participant.png`, `provider-new-course-participant.png`, and `participant-registration-landing.png`. Registration landing works signed out on staging and preserves email query-prefill.

Final staging API smoke passed all 10 checks: existing account reuse, owner-only lesson enrollment, minimal-field participant creation, whole-course reservation, a second independent provider link, credential-free phone composers, honest email delivery failure, real password setup/sign-in, activation of both links on the same UID with enrollment preserved, and QA cancellation/archiving. Evidence: `output/playwright/course-participants-staging-smoke.json`. Browser smoke reserved a real demo lesson through the Italian provider UI, then cancelled that QA reservation; the new-participant form has only name/email required and no horizontal overflow. Form evidence: `output/playwright/provider-new-participant-form.png`. Actual email delivery remains unverified while the staging Resend secret is a placeholder.

### Three-provider browser verification and general search — 2026-10-06

Three published demonstration courses were created through Playwright UI:

| Course | Provider login | Lessons | Per lesson / whole course |
|---|---|---:|---|
| Demo Karate annuale Torino | demo.provider@vitfitdemo.dev | 53 weekly | €25 / €600 |
| Demo Fitness funzionale Torino | demo.trainer@vitfitdemo.dev | 8 daily | €15 / €100 |
| Demo Yoga benessere Torino | demo.gym@vitfitdemo.dev | 4 weekly | €20 / €70 |

The third provider is a staging-only demo fixture (`demo-gym-courses-vfit`, standard demo password), cloned from the verified demo provider profile with its own Auth UID, email and name. Courses remain published for manual review. Each provider added the same existing demo customer and a separate previously nonexistent synthetic participant through the UI. Only name/email were supplied for the new participants. The existing customer retains one UID across three provider relationships; the fitness newcomer was booked for the full course.

Customer course browsing showed all three courses, including category and Torino city filtering. Exact-name general activity search originally returned no results because it searched providers only. The fix adds matching public course cards and direct links to `/courses?id=...`, with text/category/price filters and pagination. Full next lessons remain discoverable for later lesson bookings. Seven targeted tests and the full 861-test frontend suite passed; scoped lint and staging build passed. The existing booking page image warning remains unchanged.

Evidence: `output/playwright/three-demo-courses-verification.json`, `three-courses-karate-participants.png`, `three-courses-fitness-participants.png`, `three-courses-yoga-participants.png`, and `three-courses-customer-browse.png`.

Post-deployment Playwright verification passed: each exact course title returned its course card without the incorrect No results message; the shared `Demo` query showed all three; the yoga result’s Lessons link opened the correct four-lesson course with its live capacity and prices. General search evidence: `three-courses-general-search-karate.png`, `three-courses-general-search-fitness.png`, `three-courses-general-search-yoga.png`, `three-courses-general-search-all.png`, and `three-courses-general-results.png`. All three demonstration courses remain published for review.

## Business accounts release - checklist

Plan: [`docs/plans/2026-10-04-business-accounts-plan.md`](../plans/2026-10-04-business-accounts-plan.md) (task B11). **Nothing below has been deployed yet**; this is the order to follow, for `vfit-app-staging` first and, after the staging smoke, `vfit-funlife`. Every command names its project with `-P`; the commit range is `e308d61..HEAD` (B1 onwards).

Functions changed in that range, from `git diff --name-only e308d61..HEAD -- functions/src` and the exports they reach:

| Function | Why |
|---|---|
| `applyAsProvider` | `providerType` / `business` input, `status` in the result, `business_*` and `provider_type_locked` errors, review-bypass rules |
| `decideProviderApplication` | calls `commitProviderDecision`: venue `biz_<uid>` on approval, `venue_exists`, `business` map left untouched |
| `releaseBusinessVat` | **new** callable |
| `syncBusinessVenueLocation` | **new** trigger on `instructors/{instructorId}` |
| `onInstructorWriteSearchIndex` | `searchTerms` now include `business.displayName` / `legalName` |
| `saveGymSpace`, `configureGymInstructor`, `saveGymSchedule`, `updateGymSession`, `quoteGymBooking`, `quoteGymTimetable`, `bookGymClass`, `cancelGymBooking`, `recordGymPayment`, `confirmGymRefund` | `partnerGyms/store.ts` and `schedule.ts` use `hostsCourses` (gym, school, studio) instead of `type === 'gym'` |
| `chatWithAssistant` | `ai/tools/index.ts` venue-search enum gains `school` and `studio` |

(`createAiTools` is only reached through `chatWithAssistant`; `types.ts` is a shared import, not a function.) If `git diff --name-only e308d61..HEAD -- functions/src` shows more files by the time you deploy, recompute this list.

### 1. Indexes first, and wait for READY

```bash
firebase deploy -P staging --only firestore:indexes
```

Four new `users` composite indexes back the `/admin/providers` type filter (`adminHidden`, `isSuspended`, `providerVerification`, `searchTokens`, each with `providerType` before `createdAt`; see [database-schema.md](../database-schema.md#firestore-indexes)). Wait until all show **READY** in the console (Firestore > Indexes) before deploying anything that queries them. Then confirm:

```bash
node scripts/verify-admin-list-indexes.mjs --project vfit-app-staging
```

It prints OK per query shape, including the `providerType==` ones, and the missing index otherwise. `/fit/gyms` needs no new index (`venues` `type` + `geohash` and `type` + `rating` already exist).

### 2. Rules

```bash
firebase deploy -P staging --only firestore:rules
```

Adds the owner allowlist on `instructors.business`, the `providerType` freeze, `businessWebsiteSafe`, the deny-all `businessVat` match and the `activePartnerGym` school/studio types. Rules go before functions so the new callables never run against rules that predate them.

### 3. Functions

```bash
firebase deploy -P staging --force --only functions:applyAsProvider,functions:decideProviderApplication,functions:releaseBusinessVat,functions:syncBusinessVenueLocation,functions:onInstructorWriteSearchIndex,functions:saveGymSpace,functions:configureGymInstructor,functions:saveGymSchedule,functions:updateGymSession,functions:quoteGymBooking,functions:quoteGymTimetable,functions:bookGymClass,functions:cancelGymBooking,functions:recordGymPayment,functions:confirmGymRefund,functions:chatWithAssistant
```

- `--force` is needed for the retrying Firestore triggers (`syncBusinessVenueLocation`, `onInstructorWriteSearchIndex`). If a first pass fails on the per-minute mutation quota (see [Gotchas](#gotchas-found-while-building-this)), re-run the same command.
- A new gen-2 callable (`releaseBusinessVat`) can answer 401 for several minutes after its first deploy. It clears on its own.
- Run `npm run lint` in `functions/` first (the functions lint is not the web one).

### 4. Hosting

```bash
npm run deploy:staging
```

This rebuilds with `build:staging` (the project guard `assert-build-project.mjs` runs as the hosting predeploy) and deploys hosting, rules, indexes and storage. Never deploy a bundle built for the other project. Production uses `npm run deploy:prod` after a `build:prod` build (`.env.local` points at staging).

### 5. Backfills (per environment, dry run first)

Both scripts use Application Default Credentials and default to a dry run. Run them after the functions are live.

```bash
node scripts/backfill-provider-search.mjs --project vfit-app-staging           # dry run
node scripts/backfill-provider-search.mjs --project vfit-app-staging --apply

node scripts/backfill-provider-type.mjs --project vfit-app-staging             # dry run
node scripts/backfill-provider-type.mjs --project vfit-app-staging --apply
```

- `backfill-provider-search.mjs` gives existing `instructors` documents the new `searchTerms` (company names included). It computes with the same code as the trigger.
- `backfill-provider-type.mjs` writes `providerType: 'individual'` on providers who applied before business accounts, so the **Individuals** filter finds them. A document edited between the script's read and write is reported as `skipped (changed)` and does not fail the run; re-run to pick it up (the second run reports 0 to update).

### 6. Smoke test (staging, a fresh journey account)

1. Register a company with a valid P.IVA (venue type gym, with address and city): the pending screen appears and the company is **not** in `/booking` search.
2. Register a second account with the same P.IVA: inline "already registered" error under the P.IVA field.
3. As admin on `/admin/providers`: filter **Companies**, open the company, check the Company block, **Verify**. Confirm `venues/biz_<uid>` exists (owner = the company, `partnerStatus: pending`) and `instructors/<uid>.business.venueId` is set.
4. Search the public name and the legal name in `/booking`: the company shows with its logo and **Company** badge.
5. As the owner: change public name and logo on `/profile/edit` (Professional tab), confirm the P.IVA fields are read-only; save a location on `/provider/location` and confirm the venue gets the coordinates; open `/fit/gyms` and find the venue under **Gyms & schools**.
6. As admin: **Release VAT number**, confirm the audit entry, then confirm the number can be registered again.
7. Clean up: remove the test company's `instructors`, `users`, `venues/biz_<uid>` and any remaining `businessVat/<P.IVA>` document. On production, use a throwaway P.IVA and remove the claim afterwards.

Legal copy: the terms and privacy pages do not mention business data; confirm the wording with the owner before the production release (plan section 5).
