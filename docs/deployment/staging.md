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

## Reconciled business release - deployment runbook

Plan: [`docs/plans/2026-10-04-business-accounts-plan.md`](../plans/2026-10-04-business-accounts-plan.md) (task B12 and the Log entry "Reconciliation 2026-10-19"); analysis: [`docs/reports/2026-10-19-business-reconciliation-analysis.md`](../reports/2026-10-19-business-reconciliation-analysis.md).

**Status (2026-10-19): nothing of the reconciled build is deployed anywhere.** Production (`vfit-funlife`) runs the branch tree published on 2026-10-06 (rules, 53 indexes, 11 business functions, hosting; see [the release report](../reports/2026-10-06-business-production-release.md)). Staging (`vfit-app-staging`) runs the build of main@`1fa024b` (main's own business rebuild), which this release replaces. This runbook is for the reconciled commit (the tip of `reconcile/business-accounts` once merged to `main`); every command names its project with `-P` (`staging` or `production`, see [`.firebaserc`](../../.firebaserc)) and runs outside the sandbox with a valid `firebase login`.

### 0. Pre-flight (both environments)

```bash
git fetch && git log HEAD..origin/main --oneline   # nothing unexpected (Codebuff shares the checkout)
git branch --show-current                          # the branch you mean to deploy
git status --short                                 # clean; otherwise deploy from a clean git worktree
git rev-parse HEAD                                 # note the SHA you deploy
```

- A functions deploy ships the whole working tree. If anything under `functions/` is dirty, create a clean `git worktree` of the commit and symlink `functions/node_modules` from the main checkout (`npm ci` fails on the root-owned npm cache).
- Gates on that commit: `npx tsc --noEmit -p .`; `npx vitest run` (compare failures with the known baseline by file list); `cd functions && npm run lint && npm run build` (the functions lint is `npm run lint` there, not the web one); `npx vitest run src/i18n` (the five locales); the emulator suites outside the sandbox: `functions/test/business-rules.test.ts`, `business-venue.test.ts`, `chat-rules.test.ts`, `booking-rules.test.ts`, `partner-gyms-rules.test.ts`, `courses-rules.test.ts`.
- Production only, read-only: count `businessVat` documents and business users on `vfit-funlife`, confirm `systemSettings/providerOnboarding.autoApprove`, and list what is deployed: `firebase functions:list -P production`. (The Firestore MCP `query_collection` always hits prod and mishandles boolean filters: use a script with `--project`.)

### 1. Indexes first, and wait for READY

`firestore.indexes.json` is the **union file with 62 indexes**: the 53 that production has (it was deployed from the branch at `877b04c`, including the four `users` composite indexes with `providerKind`) plus 9 for courses and partner gyms that production has never had:

| Collection | Fields |
|---|---|
| `courses` | `state`, `providerEligible`, `nextStartsAt` |
| `courses` | `state`, `nextStartsAt` |
| `courseEnrollments` | `state`, `holdExpiresAt` |
| `courseRefunds` | `paymentMode`, `status` |
| `sessions` (collection group) | `state`, `cancellationReconciled` |
| `sessions` (collection group) | `state`, `startsAt` |
| `gymSessions` | `venueId`, `status`, `startsAt` ~~removed 2026-10-20 (gym flow removal, staging; never on production)~~ |
| `gymSessions` | `venueId`, `startsAt` ~~removed 2026-10-20 (gym flow removal, staging; never on production)~~ |
| `gymBookings` | `sessionId`, `state` ~~removed 2026-10-20 (gym flow removal, staging; never on production)~~ |

Main's old index file (62 entries too, but with four `providerType` indexes instead of the `providerKind` ones) must **never** be deployed. Never run `firebase deploy --only firestore:indexes --force` on production: `--force` deletes live indexes that are not in the file.

```bash
firebase firestore:indexes -P production > /tmp/indexes-before.json     # expect 53 before
firebase deploy -P production --only firestore:indexes                  # additive
# wait until none is CREATING (console: Firestore > Indexes), then:
firebase firestore:indexes -P production | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).indexes.length))'   # expect 62
node scripts/verify-admin-list-indexes.mjs --project vfit-funlife       # every query shape OK, 0 missing
```

For staging use `-P staging` and `--project vfit-app-staging`. Production was last verified with 92 query shapes passing (53 indexes READY, 2026-10-06). The courses queries (`/courses`, partner-gym timetable) are not covered by `verify-admin-list-indexes.mjs`: exercise them in the smoke test. The CLI warns about indexes in the project that are not in the file (staging has four, see below): leave them alone on production.

### 2. Functions (full list, retry triggers need `--force`)

Every export that changed since `877b04c` (`git diff --name-only 877b04c..HEAD -- functions/src`), by area. Shared modules also changed (`utils/roles.ts` `getUserRoleInfo` feeds `requireAdmin`; `types.ts`; `users/deleteUserCascade.ts`), so **deploy the whole codebase** rather than a hand-picked subset:

- Business: `applyAsProvider`, `decideProviderApplication`, `releaseBusinessVat`, `convertBusinessToIndividual`, `updateBusinessTaxId`, `syncBusinessVenueLocation` (retry trigger), and, through `deleteUserCascade` (venues deactivated, claims deleted), `adminDeleteUser`, `adminBulkDeleteUsers`, `onAdminJobCreated`.
- Courses: `saveCourse`, `previewCourse`, `enrollInCourse`, `enrollCourseParticipant`, `notifyCourseParticipant`, `cancelCourseEnrollment`, `recordCoursePayment`, `manageCourseSession`, `cancelRemainingCourse`, `confirmCourseRefund`, `createCourseCheckout`, `courseStripeWebhook`, `maintainCourseEnrollments`, `remindCourseParticipants`, `onCourseNotification`, `onCourseProviderEligibility`, `setPaymentSettings`.
- Partner gyms: `saveGymSpace`, `configureGymInstructor`, `saveGymSchedule`, `updateGymSession`, `quoteGymBooking`, `quoteGymTimetable`, `bookGymClass`, `cancelGymBooking`, `recordGymPayment`, `confirmGymRefund`, `onGymNotification`. **Annotation, removed 2026-10-20:** `saveGymSchedule`, `updateGymSession`, `quoteGymBooking`, `quoteGymTimetable`, `bookGymClass`, `cancelGymBooking`, `recordGymPayment`, `confirmGymRefund` and `onGymNotification` were deleted from staging by the gym-flow removal and no longer exist in the source; only `saveGymSpace` and `configureGymInstructor` remain. They were never deployed to production, so there is nothing to delete there.
- Bookings, profile and others: `createBooking`, `getBooking`, `listBookings`, `cancelBooking`, `confirmBooking`, `updateBookingStatus`, `createBookingAsTrainer`, `updateBookingPrivateNotes`, `createClientAccount`, `resendClientAccountEmail`, `addClientByEmail`, `syncEmailVerification`, `updateNotificationSettings`, `updatePrivacySettings`, `updateAvatar`, `seedServiceCategories`, `chatWithAssistant` (the venue-search tool enum gains `school` and `studio`).

```bash
cd functions && npm run lint && cd ..
firebase functions:list -P production            # note what exists; compare after
firebase deploy -P production --force --only functions
```

- `--force` is required for the retrying triggers (`syncBusinessVenueLocation` and the other `retry: true` Firestore triggers); it also skips the prompt before deleting functions that exist in the project but are not in the source, so compare `functions:list` with the source first.
- **Delete function `updateSocialLinks` (removed 2026-10-20, R11).** The callable no longer exists in the source: the profile editor writes `socialLinks` straight to `users/{uid}` (validated on the client and by the rules). The projects still have it deployed (production and staging both do). A `--force` full deploy deletes it without a prompt; otherwise delete it by hand, **after** the new hosting is live and users have had time to reload (an old cached client still calls it): `firebase functions:delete updateSocialLinks -P <staging|production> --region europe-west1 --force`. Nothing else depends on it. This repo's R11 change did not run any deploy or delete.
- With roughly 90 functions the per-minute mutation quota can fail a first pass on a few triggers: re-run the same command.
- New gen-2 callables answer 401 for several minutes after their first deploy. It clears on its own.

### 3. Rules

```bash
firebase deploy -P production --only firestore:rules
```

The rules tighten owner writes: the business map keys `venueType`, `address` and `venueId` are frozen for the owner, `name == fullName == business.displayName` on owner updates, `socialLinks.*` must be an http(s) URL or an `@handle` (at most 200 characters), the `activePartnerGym` rule covers gym, school and studio. Deploy them **after** the functions, so the callables that write those fields (approval, `applyAsProvider`) are already the new ones when the rules start refusing client writes.

### 4. Hosting, built for the target project

```bash
npm run build:staging && firebase deploy -P staging --only hosting       # staging
npm run build:prod    && firebase deploy -P production --only hosting    # production (.env.local points at staging)
```

Do not use `npm run deploy:prod` here: it deploys `hosting,firestore,storage` in one go and so ignores the order above. The hosting `predeploy` hook (`scripts/assert-build-project.mjs`) cancels a deploy whose bundle was built for the other project.

**Why this order (version skew).** Hosting is last because a client must never call a callable that has not been deployed. The opposite skew is also real and is why admins must **hard-reload** after the deploy (Hosting caches `/_next/static/**` as immutable): an old cached admin client sends no `venueType`/`address` in `expectedReview`, so approving a company that declared premises answers `stale_review`; an old cached signup client does not send `venueType`, which the server reads as "no fixed premises", so the company is created without a venue. Nothing is corrupted by either, but both look like bugs. An old admin client also calls `releaseBusinessVat` with the wrong input (`providerId`) if it still comes from main's build.

### 5. Staging first

Redeploy staging from the reconciled commit with sections 1 to 4 (`-P staging`). What main's deploys left there, and what this replaces:

| Surface | On staging now (main@`1fa024b`) | Action |
|---|---|---|
| Rules | main's | `firestore:rules` from the reconciled commit |
| Indexes | 62 plus four orphan `providerType` indexes | `firestore:indexes` (additive); afterwards delete the four `providerType` indexes (console, or `--force` **on staging only**) |
| Functions overwritten by main | `applyAsProvider`, `decideProviderApplication`, `releaseBusinessVat` (input `providerId`), `syncBusinessVenueLocation`, `onInstructorWriteSearchIndex`, the partner-gym callables, `chatWithAssistant` | the full-codebase deploy above replaces them, including `--force` for the triggers |
| Hosting | main's build | `build:staging` then hosting |
| Data | companies, `businessVat` claims and `venues/biz_*` created by main's flows; `users.providerType: 'individual'` on providers | usable as is; delete the synthetic companies once verified (Auth user, `users`, `instructors`, `businessVat`, `venues/biz_*`) |

Then `node scripts/backfill-search-tokens.mjs --project vfit-app-staging` (dry run) to confirm there are no `providerKind` gaps.

**B10 journey checklist on staging** (390x844 dark and light; 320 and 390 px in it and de for the narrow checks; fresh private browser context per actor; staging only admits allowlisted emails at `/admin/staging-access`):

1. Company signup with venue type and address (gym), pending screen, the company is not in `/booking` search.
2. Duplicate tax id from a second account: inline error, fix the number on the same form and resubmit without "email already exists".
3. Admin on `/admin/providers` (Companies filter): the review card shows venue type and address; approve (the page updates without a reload; a change made by the owner in between gives `stale_review`).
4. The venue `biz_<uid>` exists and is listed under Gyms & schools on `/fit/gyms` once the owner saved a location (`/provider/location`); it appears in `/admin/venues` with the Owner column.
5. Owner edits public name and logo (venue name follows, slug does not), tax id and venue fields are read-only; customer finds the company with the Company badge and books it (badge/logo on `/book`, the confirm page and the booking detail).
6. Admin corrections: release a rejected company's claim (`releaseBusinessVat` with the number), convert to individual, correct the tax id (`updateBusinessTaxId`); each audited.
7. Reject (or convert) an approved company: the venue becomes inactive and leaves `/fit/gyms`; approve again: it is reactivated, not duplicated (a venue an admin switched off by hand is not: it has no `deactivatedBy: 'lifecycle'` marker).
8. Admin detail header and tab strip at 320 and 390 px with a long email; the Individual/Company toggle by keyboard.
9. Courses smoke (`node scripts/smoke-group-courses-staging.mjs`, `smoke-course-participants-staging.mjs`) if the courses stack is part of the release.

Record the result in `docs/user-journeys/business-signup-verification.md` and re-shoot the venue screenshots the guides flag as pending.

### 6. Production

Only after the staging checklist passes and the owner decision below is taken. Sections 0 to 4 with `-P production`, `--project vfit-funlife` and `build:prod`; production data steps:

- `providerKind` backfill is **already done** on production (102 users updated on 2026-10-06, dry run then 0 remaining): re-run `node scripts/backfill-search-tokens.mjs --project vfit-funlife` as a dry run only if a count looks off. No `providerType` backfill exists any more (`scripts/backfill-provider-type.mjs` was dropped); the 2026-10-06 release left no test company behind and no real company is recorded in the reports; confirm with the read-only count in section 0.
- Smoke without leaving data behind: signed-out checks (`/fit/gyms`, `/courses` load without console errors), then one company signup with a throwaway tax id, left pending, and its Auth user, `users`/`instructors` documents and `businessVat` claim removed afterwards (as on 2026-10-06). Do not approve a test company on production: that would create a public venue.
- After the deploy, ask admins to hard-reload `/admin`.

### Open decision: ship courses and partner gyms to production with this release?

Production has **never** run the courses / participants / partner-gym stack: 9 indexes, about 40 functions and triggers (the Courses, Partner gyms and Bookings/profile groups in section 2), the matching rules, and the hosting pages. Deploying the reconciled branch ships all of it for the first time. Options for the owner:

1. Ship everything together (simplest; the code and rules are one tree). Stripe/course checkout stays off (`courseCheckoutEnabled` and `stripePaymentsEnabled` default false); staging smoke covers it.
2. Ship the business changes only. This is not a clean split: `firestore.rules` and `firestore.indexes.json` are single files (the courses rules and indexes ride along; harmless but the 9 indexes still build), and the functions would have to be deployed by explicit `--only functions:<names>` for the business group plus `chatWithAssistant` and the user-deletion functions, leaving prod's current course-less versions of `createBooking` and friends untouched. Hosting contains the courses pages either way.

Until the owner decides, production stays on the 2026-10-06 tree. The unified-courses plan (P2) assumes prod has no gym data (task L8 step 1): if option 1 is taken, that preflight will list gym functions and L8 must take its two-deploy path.

### Staging redeploy — 2026-10-20 (reconciled f3abc70)

Deployed to `vfit-app-staging` only, from `main` at `f3abc70` (clean tree, in sync with `origin/main`), in the runbook order. Production was not touched.

| Step | Result |
|---|---|
| Gates | `npx tsc --noEmit -p .`, `cd functions && npm run lint`, `npm run build` all exit 0 |
| Indexes | `firebase deploy -P staging --only firestore:indexes` (additive). All 62 indexes of the file were already present (the earlier branch restore had left the four `providerKind` ones in place), so the deploy created nothing; 66 indexes on the project, 66 READY (checked through the Firestore Admin REST API, the CLI does not print state). `verify-admin-list-indexes.mjs --project vfit-app-staging`: 92 query shapes OK, 0 missing |
| Functions | `firebase deploy -P staging --force --only functions`: 159 functions updated, all ACTIVE with an update time of 2026-10-20. The per-minute mutation quota ("Quota Exceeded") hit about 50 functions during the first pass and the CLI retried them; the run ended with `onAdminJobCreated` and `seedDemoData` not reported, so they were deployed once more with `--only functions:onAdminJobCreated,functions:seedDemoData` (both succeeded, `fix-staging-blocking-uris.mjs` postdeploy ran). Nothing was deleted: the four live-only functions (`addStagingAccess`, `removeStagingAccess`, `stagingBeforeUserCreated`, `stagingBeforeUserSignedIn`) are exported by the source for `GCLOUD_PROJECT=vfit-app-staging`. Confirmed present: `applyAsProvider`, `decideProviderApplication`, `releaseBusinessVat`, `convertBusinessToIndividual`, `updateBusinessTaxId`, `syncBusinessVenueLocation`, `onInstructorWriteSearchIndex`, the course, partner-gym and participant callables |
| Rules | `firebase deploy -P staging --only firestore:rules`, released (after the functions) |
| Hosting | `npm run build:staging` (outside the sandbox: Turbopack's PostCSS worker needs to bind a port), then `firebase deploy -P staging --only hosting`; `https://vfit-app-staging.web.app` answers 200 |
| Backfill dry run | `backfill-search-tokens.mjs --project vfit-app-staging`: 34 users scanned, 0 documents to update (no `providerKind` gaps) |

**Stray indexes** (on staging, not in `firestore.indexes.json`; left alone, `--force` was not used). They are the four `providerType` indexes from main's old build, all on `users`:

1. `adminHidden`, `isSuspended`, `providerVerification`, `providerType`, `createdAt desc`
2. `adminHidden`, `providerVerification`, `providerType`, `createdAt desc`
3. `searchTokens` (array), `adminHidden`, `isSuspended`, `providerVerification`, `providerType`, `createdAt desc`
4. `searchTokens` (array), `adminHidden`, `providerVerification`, `providerType`, `createdAt desc`

Delete them from the console (or with `--force` on staging only) once the B10 journey has been repeated.

**Leftover synthetic data from main's flows** (read-only count, nothing deleted): `businessVat` has **0** documents, although two approved companies exist (see below), so the claims were not created by main's build. Three `venues/biz_*` and five instructors with a `business` map, all `@vitfitdemo.dev` test accounts:

| uid | email | state | tax id | venue |
|---|---|---|---|---|
| `EEK8TcGzZ4YAaeBbMLubf2nYPrm1` | `journey.biz.it.202610191930@vitfitdemo.dev` | provider, verified | 12345678903 | `biz_EEK8…` "Palestra Journey Milano", active |
| `GjMJqDTrn0Y0KyEMJfApoLIBD6m1` | `journey.biz.en.202610191930@vitfitdemo.dev` | provider, verified | 01234567897 | `biz_GjMJ…` "Journey Fitness Torino", active |
| `x473tgl2PZanNCUgd6YM6QvYuKC2` | `journey.biz.recheck.a.202610192224@vitfitdemo.dev` | provider, verified | 01234567897 | `biz_x473…` "Recheck Gym A Renamed", active |
| `DcUGtqHiUjaBxYBUN9ifeivbA502` | `journey.biz.recheck.b.202610192224@vitfitdemo.dev` | customer, pending | 12345678903 | none |
| `RRLZbsBhO1PYLUxtBqmRj3ZPATq2` | `journey.biz.dup.202610191930@vitfitdemo.dev` | customer, pending | 01234567897 | none |

Their `users` documents carry both `providerKind: 'business'` and the old `providerType: 'business'`. Tax ids repeat across accounts (12345678903 twice, 01234567897 three times) and no `businessVat` claim backs any of them, so the uniqueness guarantee does not hold for this data: do not use these accounts to judge duplicate-VAT behaviour, and delete them (Auth user, `users`, `instructors`, `venues/biz_*`) after the B10 journey, using fresh tax ids for it.

The B10 browser journey (section 5) was run on 2026-10-20: see [`business-reconciled-verification.md`](../user-journeys/business-reconciled-verification.md); the five leftover synthetic companies above were deleted through the admin UI (their `venues/biz_*` documents remain, inactive). Still to do on staging: the courses smoke scripts and the stray-index deletion.

### Staging deploy of main's rebuild, 2026-10-19 (superseded, kept as a record)

Deployed to `vfit-app-staging` only from `main` at `ed9302f`, later rebuilt through `20759f9`/`1fa024b`: `firestore:indexes` (four `users` `providerType` indexes, about 5 minutes; 92 query shapes OK; the CLI warned about four indexes in the project that are not in the file and they were left alone), rules, 16 functions (`applyAsProvider`, `decideProviderApplication`, `releaseBusinessVat` updated with input `providerId`, `syncBusinessVenueLocation` created, `onInstructorWriteSearchIndex`, the ten partner-gym callables, `chatWithAssistant`), hosting from `build:staging`, backfills (`backfill-provider-search.mjs` 0 to update; `backfill-provider-type.mjs` 12 users + 12 instructors, since deleted). The B10 browser verification of that build is in [`business-signup-verification.md`](../user-journeys/business-signup-verification.md) (with the reconciliation banner).

### P2 backend staging deploy — 2026-10-20 (unified courses, main@cc8671f)

Deployed to `vfit-app-staging` only (never `vfit-funlife`), from `main` at `cc8671f` (clean, in sync with `origin/main`, no foreign commits), in the order indexes, rules, functions. **Hosting was not redeployed.** Plan tasks F5 and F6 of `docs/superpowers/plans/2026-10-19-unified-courses.md`.

| Step | Result |
|---|---|
| Gates | `cd functions && npx tsc --noEmit && npm run lint && npm run build` exit 0. Emulator suites against the running emulator (`GCLOUD_PROJECT=demo-vfit-test FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 RACE_ITERATIONS=1 npx vitest run src test/courses-rules.test.ts test/unified-courses-rules.test.ts test/partner-gyms-rules.test.ts test/business-rules.test.ts`): 1818 passed, 0 failed |
| Backfill | `node scripts/backfill-session-listed.mjs --project vfit-app-staging` (dry run): 0 venue-linked courses, 0 sessions, `documents to update: 0`; nothing to apply (all 15 courses on staging were unlinked, `venueId: null`) |
| Indexes | `firebase deploy -P staging --only firestore:indexes` (additive; 68 in the file). 6 new: `courses` (`venueId`,`state`,`nextStartsAt`) and (`venueId`,`state`,`providerEligible`,`nextStartsAt`); `sessions` collection group (`venueId`,`listed`,`state`,`startsAt`), (`instructorId`,`listed`,`state`,`startsAt`), (`state`,`waitlisted`); `waitlist` collection group (`userId`,`createdAt`). All 6 CREATING at deploy, all READY about 2 minutes later (Firestore Admin REST: 72 indexes, 72 READY = 68 + the 4 stray `providerType` ones). `node scripts/verify-admin-list-indexes.mjs --project vfit-app-staging`: 0 missing |
| Rules | `firebase deploy -P staging --only firestore:rules` released |
| Functions | `firebase deploy -P staging --force --only functions` (whole codebase: shared modules changed): 161 functions, 158 updated and 3 created, all in `europe-west1`. The new callables `quoteCourse`, `joinCourseWaitlist`, `leaveCourseWaitlist` are in `firebase functions:list -P staging`. The per-minute mutation quota ("Quota Exceeded") hit a few functions and the CLI retried them; the run ended with "Deploy complete" and no re-run was needed. `cancelCourseEnrollment`, `manageCourseSession`, `cancelRemainingCourse` now bind `STRIPE_SECRET_KEY` (secret exists on staging, version 1 ENABLED, a placeholder) |

**Smoke** (`node scripts/smoke-unified-courses-staging.mjs --keep`): 25 checks, passed twice in a row (second run after `--cleanup`, which removed 4 courses, the venue, the staff link and reset the instructors' `partnerStatus`, with zero lock slots left). Evidence: `output/playwright/unified-courses-staging-smoke.json` (git-ignored). Covers the §9 list: venue, staff and spaces seeding, forced location timezone, `room_overlap` / `instructor_overlap` naming the conflicting course, `quoteCourse` 1275 / 15 %, `price_changed`, discounted enrollment (total 1275, discount 225), `lesson_full`, waitlist positions 1 and 2, promotion with renumbering, inert replay, staff substitute (revision 2) and its overlap, capacity raise promotion, cash payment, `removeParticipant`, free lesson, stranger `course_owner_required`, waitlist privacy over REST, the anonymous venue timetable query (200, then 403 for a suspended venue), and the lock invariant. One observation: a free lesson requested with `paymentMode: "stripe"` while course checkout is off answers "Online course payments are not enabled" (the check in `enroll()` runs before the price is known); the client must send `direct` for a 0 price. With checkout on the same call becomes a free direct booking.

**Fixture left in place** (`--keep`, for the Group G/H browser checks; `--cleanup` runs in K3): venue `smoke_unified_venue` (gym, owner `demo.provider`, 10 % + 5 % partner discount, staff `journey.it.provider`, instructor links for `journey.en.provider` (partner active) and `demo.provider` (partner pending), one location and rooms "Smoke Room 1/2"), and courses "Smoke Unified A" (room 1, instructor B, capacity 1 -> 2, three lessons from today+7 at 18:00 Rome), "Smoke Unified C" (room 2), "Smoke Unified Free" (price 0) and the unlinked "Smoke Unified D". Ids are in the evidence file under `fixture`. Accounts: `demo.*` use `VfitDemo!2026`, `journey.*` use `JourneyDemo!2026`.

**Load checks** (`scripts/smoke-unified-courses-load-staging.mjs`, own venue `smoke_load_venue`, 20 throwaway customers `smoke-load-NN@vitfitdemo.dev` with temporary `stagingAllowlist` entries; everything removed afterwards, also on failure):

| Check | Result |
|---|---|
| `saveCourse`, 400 daily lessons, room + instructor locks | success in about 4 s: 400 sessions, 800 lock documents (about 1,200 writes in one transaction, so the 500-write limit does not apply here) |
| `cancelRemainingCourse` on that course, 5 enrollments and 4 waitlist entries | success in 18.4 s; every lesson `cancelled`, `listed:false`, `cancellationReconciled:true` when the call returned (the callable's own loop finished, the maintenance job was not needed); 0 lock documents, 0 waitlist entries, all enrollments cancelled |
| Same with `--heavy` (95 booked lessons, 22 waitlist entries) | success in 25.4 s and 24.5 s; same end state. Firestore counters for the 24.5 s run (project-wide Cloud Monitoring, one minute bucket with idle padding around it): about 1,860 document reads, 984 writes, 877 deletes. The sequential per-lesson loop after the transaction is what takes the time; a callable has a 60 s default timeout, so, extrapolating linearly (an estimate, not measured), about 2.5 times this load would hand the remaining lessons to `maintainCourseEnrollments` (100 lessons per 5-minute run) |
| 20 concurrent `joinCourseWaitlist` on one full lesson (different customers), three bursts | 20 of 20 succeeded each time, no failure, no `internal`; positions exactly 1..20; wall time 4.7 s, 5.9 s, 5.6 s (median 1.9 to 2.1 s per call, max 4.7 to 5.9 s: the joins serialise on the lesson document); counters consistent (`occupied` 1, `waitlisted` 20, 20 entries, no gaps); replaying all 20 calls: 20 inert replays; releasing the seat promoted exactly the position-1 customer and renumbered the rest to 1..19 (checked against the recorded positions in the last two bursts) |

**Known broken until Groups G/H** (hosting still serves the old build): the customer course UI (`/courses`, booking sheet) calls `enrollInCourse` without `expectedFinalCents` / `expectedRevisions`, which the new callable answers with `expected_price_required`, so customers cannot book a course from the old UI. The provider course editor does not send the venue fields. The gym flow and its UI are untouched (removed in the last group). Staff and API callers are unaffected.

### Unified courses hosting deploy — checklist (plan task K1)

Ships the customer and provider course UI (plan Groups G and H) to `vfit-app-staging`. The backend is already there: indexes, rules and functions were deployed from `cc8671f` (entry above), so this deploy is **hosting only**, last, in the order the version-skew rule above requires (a client must never call a callable that is not deployed). Staging only; production is Task L8 at the very end of the plan and ships once.

**What is broken on staging until this is deployed** (hosting still serves the build from before the unified model):
- **Customers cannot book a course.** The old booking sheet calls `enrollInCourse` without `expectedFinalCents` / `expectedRevisions`, which the deployed callable answers with `expected_price_required`. A full lesson also no longer answers `session_full`, so the old staff "Add participant" form shows its generic error instead of the "lesson full" text.
- The provider editor does not send `venueId` / `locationId` / `roomId` / `instructorId` / `waitlistEnabled`, so venue-linked courses cannot be authored from the UI; the venue-scoped page `/provider/courses?venue=<id>`, the **Locations and rooms** panel on it, substitute / capacity / waitlist / remove-participant actions and the venue-staff navigation do not exist in the old build.
- There is no public weekly timetable (`/fit/gyms/timetable` still renders the old partner-gym timetable), the venue page still shows the legacy class cards from `venues/{id}/courses`, and `/courses?tab=bookings` has no waitlist section or pay-within hint.
- Staff and API callers (scripts, the smoke) are unaffected: they already send the new inputs. The gym flow and its UI are untouched until Group L.

**Checklist** (outside the sandbox where it says so; run from `/Users/hidranarias/projects/vfit`):

1. **Preconditions.** `git branch --show-current` prints `main`; `git fetch && git log HEAD..origin/main --oneline` (note foreign commits, the checkout is shared with Codebuff); `git status --short -- functions firestore.rules firestore.indexes.json src` shows nothing you did not intend to ship (deploy from a clean `git worktree` of the commit otherwise: `git worktree add ../vfit-deploy HEAD`, symlink `functions/node_modules`). `.env.local` points at staging, but build with `build:staging` anyway.
2. **Gates.** `npx tsc --noEmit -p .`; `npx vitest run` (only the known baseline failures may remain; stash-compare anything else); `npx eslint src/components/courses src/components/venues src/hooks src/lib "src/app/(main)/courses" "src/app/(main)/provider" "src/app/(main)/fit" "src/app/(main)/venue"`; `cd functions && npx tsc --noEmit && npm run lint`; the emulator suite (`cd functions && npx firebase emulators:exec --only firestore --project demo-vfit "npx vitest run"`).
3. **Backend drift since `cc8671f`.** `git diff cc8671f..HEAD --stat -- functions firestore.rules firestore.indexes.json`. Everything that changed there must be on staging before the new hosting. At the time of writing that is: `saveCourse` (lessons now carry `courseName` and `timezone`) and the notification texts in `functions/src/notifications/bookingMessages.ts` (served by `onCourseNotification`; German `instructor_changed` and English `waitlist_cleared` wording). Deploy them with `npx firebase deploy -P staging --only functions:saveCourse,functions:onCourseNotification --force`; if rules or indexes changed, indexes first (`--only firestore:indexes`, wait until `npx firebase firestore:indexes -P staging | grep -ci creating` is 0), then `--only firestore:rules`. Then `node scripts/backfill-session-listed.mjs --project vfit-app-staging --names` (dry run) and, if it reports work, again with `--apply`, so lessons written before that change have a name and timezone. No work is expected beyond fixture data.
4. **Hosting, built for staging.** `npm run build:staging && npx firebase deploy -P staging --only hosting`. The hosting `predeploy` hook (`scripts/assert-build-project.mjs`) cancels the deploy if the bundle was built for another project. Optionally `npm run check:bundle` first. Do not use `npm run deploy:staging` (it also deploys firestore and storage).
5. **Hard-reload.** Static assets are cached as immutable: open the site in a fresh private context (or hard-reload) before judging the result.
6. **Smoke after deploy.** `node scripts/smoke-unified-courses-staging.mjs --keep` must print `PASS` for all 25 checks and `Evidence: output/playwright/unified-courses-staging-smoke.json`; it leaves the fixture venue `smoke_unified_venue` (courses "Smoke Unified A", "C", "Free" and the unlinked "D") for the browser journeys. Accounts: `demo.provider`, `demo.customer`, `demo.admin` use `VfitDemo!2026`, the `journey.*` accounts `JourneyDemo!2026`.
7. **Browser smoke list** (Playwright MCP, 390x844, Italian then English; evidence into `output/playwright/unified-courses-*.png`; plan task K2 has the full journeys):
   - Owner `demo.provider`: `/provider/courses/create` → venue → location → room → instructor; the timezone is read-only; the preview marks a room overlap against "Smoke Unified A".
   - Visitor: `/fit/gyms/timetable?id=smoke_unified_venue` shows day tabs and regular prices; signed in as `demo.customer`, a discounted lesson shows the struck-through regular price and the member price.
   - Customer: open a card → review (regular price, benefit lines, savings, your price) → confirm; change the capacity from the owner's context in between to see the "lesson was updated" notice, then confirm again.
   - Waitlist: a second customer joins the full lesson (`#1` in `/courses?tab=bookings`), the first cancels, the second's booking appears and a notification exists.
   - Venue staff (a customer made `venueStaff`): the provider menu shows only **Manage courses**, the venue-scoped list, substitute an instructor, raise capacity.
   - Free lesson ("Smoke Unified Free"): no payment options, shows **Free** and paid.
   - `/venue?id=smoke_unified_venue` shows **Next lessons** and the **Full timetable** link; dark and light, and 320 px for the German timetable header.
8. **Record and push.** Add the result (commit, what was redeployed, smoke and journey evidence paths, known gaps) to this file as a dated entry (plan task K3), run `node scripts/smoke-unified-courses-staging.mjs --cleanup` to remove the fixture, then `gh auth switch --user hidran && git push`.

Rolling hosting back to the previous build would bring back the broken customer booking (the backend no longer accepts its calls): fix forward instead.

#### Unified courses hosting deploy — 2026-10-20

Deployed to `vfit-app-staging` from `1dd1261` (main, clean tree, nothing foreign on `origin/main`), in the order above:

- **Gates:** `functions` `tsc --noEmit`, `npm run lint` and `npm run build` clean; root `tsc --noEmit -p .` clean.
- **Indexes (first):** `firebase deploy -P staging --only firestore:indexes` (no `--force`). 7 new composite indexes (`courseEnrollments`: userId, providerId, venueId, venueId+courseId, providerId+courseId, each by `createdAt` desc; `courseRefunds`: venueId, providerId by `createdAt` desc); the live count went 72 to 79 and none was left CREATING. `scripts/verify-admin-list-indexes.mjs --project vfit-app-staging`: 0 missing, 0 other errors.
- **Rules:** unchanged since `cc8671f`, not redeployed.
- **Functions:** `firebase deploy -P staging --force --only functions` (whole codebase, 161 functions updated, none created or deleted). The mutation quota answered 429 for 43 functions; the CLI's own retry updated all of them, no manual retry was needed. `quoteCourse`, `joinCourseWaitlist`, `leaveCourseWaitlist`, `syncBusinessVenueLocation`, `saveCourse`, `enrollInCourse` and `onCourseNotification` are listed; `updateSocialLinks` stays deleted.
- **Backfill:** `scripts/backfill-session-listed.mjs --project vfit-app-staging --names`: dry run 3 courses / 7 lessons to update, `--apply` 7 updated 0 failed, a second dry run reports 0.
- **Hosting:** `npm run build:staging`, then `firebase deploy -P staging --only hosting` (476 files, release complete).
- **Smoke:** `/`, `/courses/`, `/fit/gyms/timetable/?id=smoke_unified_venue` and `/provider/courses/` answer 200, a missing `/_next/static/chunks/nonexistent.js` answers 404. `node scripts/smoke-unified-courses-staging.mjs --keep`: 25 of 25 checks PASS, evidence `output/playwright/unified-courses-staging-smoke.json`; the fixture `smoke_unified_venue` was kept for the browser journeys (plan task K2) and still has to be removed with `--cleanup`.

### Gym-flow removal staging deploy — 2026-10-20 (plan task L7, main@f7c876b)

Deployed to `vfit-app-staging` only (never `vfit-funlife`) from `main` at `f7c876b` (clean tree, `origin/main` identical, pushed). Plan task L7 of `docs/superpowers/plans/2026-10-19-unified-courses.md`. Order: gates, indexes, functions, rules, cleanup, hosting, smoke, browser regression.

| Step | Result |
|---|---|
| Gates | `cd functions && npx tsc --noEmit && npm run lint && npm run build` and root `npx tsc --noEmit -p .` exit 0 |
| Indexes | `firebase deploy -P staging --only firestore:indexes` (additive; the CLI warned about 7 indexes in the project that are not in the file, 79 live, none CREATING). `firebase firestore:indexes -P staging` compared with the file (comments stripped): the only live indexes not in the file were exactly the 7 expected, so `firebase deploy -P staging --only firestore:indexes --force` ("Deleting 7 indexes") was run. **Deleted:** `gymBookings` (`sessionId`, `state`); `gymSessions` (`venueId`, `startsAt`); `gymSessions` (`venueId`, `status`, `startsAt`); and the four stray `users` `providerType` indexes from main's old rebuild (`adminHidden`,`isSuspended`,`providerVerification`,`providerType`,`createdAt`; `adminHidden`,`providerVerification`,`providerType`,`createdAt`; and the two `searchTokens` CONTAINS variants). Live count 79 then 72 = the 72 in the file, no diff either way. `node scripts/verify-admin-list-indexes.mjs --project vfit-app-staging`: 0 distinct missing composite indexes, 0 other errors |
| Functions | Before deploying, `firebase functions:list -P staging` (161) was compared with the endpoint exports of the built `functions/lib/index.js` (152, filtered on `__endpoint`): the functions deployed but not in the source were exactly `saveGymSchedule`, `updateGymSession`, `quoteGymBooking`, `quoteGymTimetable`, `bookGymClass`, `cancelGymBooking`, `recordGymPayment`, `confirmGymRefund`, `onGymNotification`; no source function was undeployed. `firebase deploy -P staging --force --only functions`: 152 updated, those 9 deleted (all "Successful delete operation"), the postdeploy `fix-staging-blocking-uris.mjs` ran. Six updates (`notifyCourseParticipant`, `configureGymInstructor`, `cancelCourseEnrollment`, `cancelRemainingCourse`, `leaveCourseWaitlist`, `courseStripeWebhook`) hit "Quota Exceeded" and the CLI's own retry succeeded, no manual re-run. `updateSocialLinks` stays deleted |
| Rules | `firebase deploy -P staging --only firestore:rules` released (the gym collection rules are gone) |
| Cleanup | `node scripts/cleanup-gym-collections.mjs --project vfit-app-staging`: dry run `gymSeries`, `gymSessions`, `gymBookings`, `gymSessionMembers`, `gymScheduleLocks`, `gymNotifications` all `0 -> 0` (nothing had been written on staging); `--apply` `0 -> 0`, "all six collections are empty"; second dry run all 0 |
| Hosting | `npm run build:staging` then `firebase deploy -P staging --only hosting` (release complete). curl: `/`, `/courses/`, `/fit/gyms/timetable/?id=smoke_unified_venue`, `/bookings/`, `/fit/gyms/` answer 200; `/gym/manage/` also answers 200 because of the catch-all rewrite to `/index.html` (the page is the public landing, no gym manager); `/_next/static/chunks/nonexistent.js` answers 404. Note: a signed-out visitor to any non-auth route on the staging host is redirected by the staging gate to `https://vfit-funlife.web.app` (production, read-only landing); testers must sign in at `/auth/login/` first |
| Smoke | `node scripts/smoke-unified-courses-staging.mjs --keep`: 25 of 25 PASS. After the browser pass, `--cleanup` removed the fixture: `smoke_unified_venue` gone, no slot in `courseScheduleLocks` (two empty day documents for 22 and 23 Oct 2026 remain), all six gym collections 0 |
| Browser regression | 16 items PASS, no console errors, no failed callables, no request to a removed callable: [`unified-courses-verification.md`](../user-journeys/unified-courses-verification.md), section "Regression after gym-flow removal (L7)" |

**Bundle budget** (`node scripts/check-bundle-budget.mjs`): at `f7c876b` `/home` 1824.0 KB raw / 523.7 KB gzip (budget 1545 / 457), `/admin` 1845.3 / 525.9 (1546 / 454) and `/booking` 1968.0 / 570.9 (1668 / 501) are over budget. At the commit before the unified-courses work (`32ffc26`, built the same way with `build:staging` in a throwaway worktree) all six routes were within budget: `/home` 1528.8 / 453.7, `/admin` 1531.1 / 449.5, `/booking` 1663.6 / 498.2. So the overshoot (about +300 KB raw, +70 KB gzip on each of the three routes) was introduced by the unified-courses work (P2), not before it. `/`, `/terms` and `/fit/gyms` stay within budget.

#### Production steps still to do for the unified-courses release (plan task L8)

Production has no gym functions, no gym indexes and no gym collections (the flow never shipped there), so the L7 deletions are **not needed on production**: do not run `cleanup-gym-collections.mjs` there (it refuses `vfit-funlife` anyway), and do not use `--force` on `firestore:indexes` (see section 1). What production does need, in addition to indexes, rules, functions and `build:prod` hosting:

1. **Venue addresses.** `node scripts/migrate-venue-address.mjs --project vfit-funlife` (dry run: lists venues whose `address` is an object), review, then `node scripts/migrate-venue-address.mjs --project vfit-funlife --apply` (venues with an object `address` become a string plus a top-level `city`; idempotent, guarded by `updateTime`). Run it before or with the hosting deploy, because the new pages read `address` as a string.
2. **Delete `updateSocialLinks`** after the new hosting is live and users have had time to reload: `firebase functions:delete updateSocialLinks -P production --region europe-west1 --force` (a `--force` full functions deploy also deletes it, see section 2).
3. **Backfills.** `node scripts/backfill-session-listed.mjs --project vfit-funlife --names` (dry run), and with `--apply` only if it reports work (lessons get `listed`, `courseName` and `timezone`).
4. **No gym function or index deletions on production.** Before deploying run `firebase functions:list -P production | grep -i gym` (expect empty before the release; after it only `saveGymSpace` and `configureGymInstructor` appear) and `firebase firestore:indexes -P production` (no `gymSessions` / `gymBookings` entries); if anything else shows up, stop and compare with the plan's L8 step 1.

### Professional categories, premises types and routed course pages — staging + production, 2026-10-20 (main@af68ca0)

Released `677e1e5` (course and roster pages, month paging) and `af68ca0` (every platform venue type as premises) to **both** projects, production included because it had not yet received the unified-courses release either.

| Step | Staging (`vfit-app-staging`) | Production (`vfit-funlife`) |
|---|---|---|
| Gates | root `tsc --noEmit -p .`; functions `tsc --noEmit`, lint, build — all exit 0 | same, exit 0 |
| Indexes | unchanged, not deployed | `firebase deploy -P production --only firestore:indexes` (additive, no `--force`); 0 left CREATING |
| Rules | unchanged | `--only firestore:rules` released |
| Functions | `--force --only functions` (whole codebase), postdeploy `fix-staging-blocking-uris.mjs` OK | `--only functions` refused until `--force` (two functions newly retried); `--force`: 148 updated/created, `updateSocialLinks` deleted, no other deletion. `quoteCourse`, `enrollInCourse`, `saveCourse`, `saveGymSpace` and `configureGymInstructor` now listed |
| Data | — | `migrate-venue-address.mjs --project vfit-funlife --apply`: 8 of 8 venues updated, second dry run 0. `backfill-session-listed.mjs --project vfit-funlife --names`: 0 venue-linked courses, nothing to write |
| Hosting | `build:staging` + `--only hosting` | `build:prod` + `--only hosting` |
| Smoke | `scripts/smoke-route-pages-staging.mjs`: 7 PASS, 1 SKIP (no multi-month booking). Categories/premises: 6 PASS — every requested trade at signup, premises list with Spa/Salone di bellezza/Spazio eventi, Fotografo, Wedding Planner and Estetista from search → `/booking?category=…`, admin catalog with Add category. Evidence: `output/playwright/route-pages-staging-smoke.json`, `professional-categories-staging-smoke.json` | routes `/`, `/auth/login`, `/auth/register`, `/terms`, `/courses`, `/courses/detail`, `/booking`, `/fit/gyms/timetable`, `/venue` answer 2xx, missing asset 404; signup offers the same 16 groups, every requested trade and the 9 premises types. 83 active categories already in the prod catalog. Evidence: `output/playwright/prod-release-smoke.json` |

**Notes.** The first staging course smoke run failed on the provider roster link 30 s after the deploy and passed unchanged on the next run — a cold start, not a code change. `--force` deleted `updateSocialLinks` a few minutes before hosting, not after: the client's `updateSocialLinks` is a direct Firestore write (`src/lib/firebase/auth.ts`), not a callable, so nothing called the deleted function. `updateSocialLinks` remains as a string in two bundle chunks only because of that local function name.

**Not covered.** No authenticated pass on production (no prod test account exists, and the demo accounts are staging-only), so the signed-in course, roster and search screens were exercised on staging only. Chromium at 390×844, Italian locale.
