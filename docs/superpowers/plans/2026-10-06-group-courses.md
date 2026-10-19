# Group Courses Implementation Plan

> Execute with superpowers:executing-plans in this session. The user explicitly requested implementation, staging deployment and smoke testing.

**Goal:** Providers publish group services; customers reserve a lesson or series, pay providers directly, and optionally use admin-enabled Stripe checkout.

**Architecture:** Authoritative course sessions and enrollments are managed by transactional callables. Existing provider services link to courses. Static customer and provider routes use shared client types and callable wrappers.

**Tech Stack:** Next.js, Firebase Firestore/Functions, Stripe Checkout, Vitest, Playwright.

**Spec:** ../specs/2026-10-06-group-courses-design.md

## Global Constraints

- Direct payments remain the default; Stripe and course checkout default off. Escrow remains unavailable.
- Maximum 100 sessions; Europe/Rome default timezone; booking notice 2 hours, cancellation deadline 24 hours, checkout holds 30 minutes.
- Protect private rosters and deny all client capacity/payment writes.
- Preserve the existing dirty workspace and deploy only to vfit-app-staging.

## Review Focus

- Concurrent last-seat enrollment must admit one customer only.
- Partial series availability must create no partial enrollment.
- Repeated cancellation/payment/webhook events must not repeat seat releases or payments.
- Daylight-saving gaps must fail validation rather than silently shift lesson times.
- Existing appointment booking must not allow a linked course through exclusive-slot booking.

### Task 1: Course domain

Files: functions/src/courses/core.ts, core.test.ts; src/types/course.ts.
Interfaces: validateCourse(input), generateSessions(input), assertReservable(course, sessions, memberships, now), allocatePrice(total, count).
- [x] Write failing tests for schedule validation, recurrence, capacity, duplicates, deadlines and price allocation.
- [x] Run functions Vitest to establish missing implementation; implement pure domain; rerun tests.

### Task 2: Transactional course API and security

Files: functions/src/courses/index.ts, enrollment.ts, operations.ts, notifications.ts; functions/src/index.ts; firestore.rules; firestore.indexes.json.
Interfaces: saveCourse, enrollInCourse, cancelCourseEnrollment, manageCourseSession, recordCoursePayment, courseParticipants, scheduled maintenance.
- [x] Test transaction behavior and authorization using mocks/rules emulator.
- [x] Implement service linkage, bounded discovery, enrollment/seat transactions, provider operations and reminders.
- [x] Verify functions build, rules and regressions.

### Task 3: Gated online checkout

Files: functions/src/courses/checkout.ts; existing payment settings backend/client/admin panel and tests.
Interfaces: createCourseCheckout, courseStripeWebhook; courseCheckoutEnabled requires global Stripe switch.
- [x] Add failing setting and payment event tests.
- [x] Implement hosted checkout, signed idempotent webhook, hold expiry and refund reconciliation.
- [x] Verify disabled requests fail server-side and existing settings remain compatible.

### Task 4: Customer/provider UI

Files: src/lib/firebase/courses.ts; src/hooks/useCourses.ts; src/components/courses/*; src/app/(main)/courses/page.tsx; src/app/(main)/provider/courses/page.tsx; existing service and booking discovery routes; locales.
Interfaces: shared Course/Session/Enrollment client models and callable wrappers.
- [x] Test course UI pricing, capacity, booking and hidden checkout.
- [x] Implement provider service creation/management, discovery, detail, enrollment and customer booking views.
- [x] Run frontend types/tests and build.

### Task 5: Documentation, staging and smoke verification

Files: docs/features.md, docs/database-schema.md, docs/api/reference.md, docs/deployment/staging.md, docs/user-journeys/group-courses.md, docs/README.md.
- [x] Document course lifecycle, payment gating, deployment configuration and user journeys.
- [x] Run full unit suites and build; report unrelated existing failures explicitly.
- [x] Deploy course callables, settings and rules/indexes, then staging-built hosting.
- [x] Smoke test provider publication, customer single/series enrollment, last-seat rejection, direct-payment recording, cancellation and checkout gating; capture browser artifacts.
- [x] Record exact deployed environment, tests and remaining external prerequisites.

## Execution ledger

- Start: user authorized implementation and staging deployment. Existing workspace contains many unrelated uncommitted changes; keep those intact. No commits or worktree migration of that work.
- Spec review: course checkout collects platform funds and records provider liabilities; automatic payout and escrow are future work. Staging Stripe secrets are documented placeholders; checkout stays off and sandbox tests may require valid test credentials.

- Review ruling: Stripe checkout initializes a stable 31-minute expiration/hold to allow one minute of creation latency beyond Stripe's 30-minute minimum; enrollment before checkout retains the 30-minute default. Store creation parameters before external calls, retrieve refunds by persisted ID, and preserve terminal refund states.
- Review fixes: booked historical schedules stay frozen even after cancellation; metadata remains editable after a series starts; cancelled-session recovery excludes reconciled records; reminders paginate; refunds reduce provider liabilities.
- Test runner separation: frontend Vitest excludes functions/**; backend runs through functions/package.json with emulator and GCLOUD_PROJECT supplied.

- Verification: frontend full suite 843 passed; backend full suite 981 passed; final course integration suite 16 passed after archive regression. Staging build, types, backend lint/build and course frontend lint passed. Existing unrelated MetricsClient frontend lint error recorded.
- Staging: scoped 17 functions, Firestore rules/indexes and staging-built hosting deployed. API smoke and Playwright provider/customer journeys passed; screenshots and JSON evidence in output/playwright. Checkout switches remain off; actual Stripe sandbox charge requires valid staging test secrets.
- Follow-up editor fixes: dedicated create/edit routes, provider-scoped tab draft preservation, translated alphabetical typeahead category selection and structured/localized preview validation. 8 UI and30 backend course tests passed; staging build and scoped lint passed. Staging saveCourse/previewCourse/hosting deployed; Italian browser smoke verified route navigation, category keyboard search/sort, outside click, refresh, errors, preview and saves. Evidence in course-editor-staging-smoke.json.
- Annual-course correction: removed100lesson and explicit cancellation caps; retained3year date-span bound. Verified104weekly,365daily,366leapyear generation;365lesson concurrent booking/full cancellation;long notificationID hashing;skipzero refunds;paginateexternalStripe refund recovery. 34backend+8UItests passed, stagingbuild/scopedlint passed. StagingAPI publication/enrollment/payment/fullrefund/QAcleanup and Italian104lesson preview passed. Current docs/spec supersede earlier100lesson cap.
