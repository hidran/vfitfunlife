# V Fitness & Wellness — Documentation

Index of project documentation. Each file is the canonical source for its topic; if you're updating something, update the doc.

## Product & Design

| Doc | What's in it |
|---|---|
| [architecture.md](architecture.md) | System architecture, data flow, key technical decisions |
| [preventivo-aggiornato-2026-10-06.md](preventivo-aggiornato-2026-10-06.md) · [PDF](preventivo-aggiornato-2026-10-06.pdf) | Updated scope and development estimate, including company management; original estimate retained for reference |
| [features.md](features.md) | Feature catalog across VFit / VFun / VLife verticals |
| [user-flows.md](user-flows.md) | Generic end-to-end flows (auth, booking, payment, etc.); the detailed per-actor journeys are in [user-journeys/](user-journeys/README.md) |
| [user-journeys/README.md](user-journeys/README.md) | **Index of all user journeys by actor** (customer, individual provider, company owner, venue staff, admin, visitor), with the screenshots status |
| [user-journeys/signup-to-booking.md](user-journeys/signup-to-booking.md) · [Italiano](user-journeys/signup-to-booking.it.md) | Screenshot walkthrough (dark theme, mobile): provider and customer from signup to a confirmed booking, in English and Italian (each also as `.docx`) |
| [user-journeys/business-signup.md](user-journeys/business-signup.md) · [Italiano](user-journeys/business-signup.it.md) | Company signup walkthrough: register as a company with venue type and address, admin approval (the venue is created on approval), search with the Business badge, profile and logo editing, the venue under Gyms & schools, releasing a tax id (venue-step screenshots re-shot on 20 October 2026) |
| [user-journeys/company-owner-venue.md](user-journeys/company-owner-venue.md) · [Italiano](user-journeys/company-owner-venue.it.md) | Company owner's venue journey: locations and rooms, partner status and instructors (admin), publishing venue courses, staff, rejection and conversion effects |
| [user-journeys/group-courses.md](user-journeys/group-courses.md) · [Italiano (cliente)](user-journeys/group-courses.it.md) | Group courses by actor: customer (timetable, price review, discounts, waitlist, cancel), individual provider (create, roster, payments), venue-linked courses (rooms, instructors, locks), online checkout, notifications |
| [user-journeys/venue-staff.md](user-journeys/venue-staff.md) | Venue staff and managers: Venue courses entry, courses on behalf of the owner, lesson actions, roster, payments, refunds |
| [user-journeys/admin-business-and-venues.md](user-journeys/admin-business-and-venues.md) | Admin and superadmin: review companies, tax-id corrections, convert, venues and partner status, instructor links, staff records, user deletion effects, payment and course-checkout switches |
| [user-journeys/business-signup-verification.md](user-journeys/business-signup-verification.md) · [business-reconciled-verification.md](user-journeys/business-reconciled-verification.md) | Browser-verification logs: main's superseded B10 run (D1-D16) and the 20 October 2026 run of the reconciled release |
| [user-journeys/partner-gym-timetable.md](user-journeys/partner-gym-timetable.md) | Stub: the separate partner-gym flow is superseded by group courses and being removed |
| [user-journeys/production-release-checklist.md](user-journeys/production-release-checklist.md) | Production test checklist of the 2026-10-06 business release |
| [database-schema.md](database-schema.md) | Firestore collections, document shapes, indexes |
| [design-system.md](design-system.md) | Brand identity, color tokens, typography, component inventory, Tailwind v4 patterns |
| [wireframe/](wireframe/) | Reference wireframes and layout mockups |

## API

| Doc | What's in it |
|---|---|
| [api/reference.md](api/reference.md) | Formal API reference — auth, cloud function signatures |
| [api/integration-guide.md](api/integration-guide.md) | SDK setup and integration walkthrough |

## Backend

| Doc | What's in it |
|---|---|
| [backend/cloud-functions.md](backend/cloud-functions.md) | Cloud Functions overview and business logic |
| [backend/firebase-auth-setup.md](backend/firebase-auth-setup.md) | Firebase Auth configuration (email, phone, Google, Apple) |
| [backend/roles-and-permissions.md](backend/roles-and-permissions.md) | RBAC: roles, permission matrices, Firestore rules, developer API reference |
| [backend/seeding.md](backend/seeding.md) | Demo data seeding functions (`seedAllData`, `seedQuickData`, `clearAllData`) |

## Mobile

| Doc | What's in it |
|---|---|
| [mobile/capacitor-guide.md](mobile/capacitor-guide.md) | Capacitor setup, iOS/Android build, plugins, native config |

## Deployment

| Doc | What's in it |
|---|---|
| [deployment/guide.md](deployment/guide.md) | Comprehensive deployment guide (envs, Firebase, hosting) |
| [deployment/checklist.md](deployment/checklist.md) | Pre-deploy checklist for releases |
| [deployment/staging.md](deployment/staging.md) | Staging environment, group-courses release notes, the **Reconciled business release - deployment runbook** (indexes, functions, rules, hosting; staging then production) and the **Unified courses hosting deploy** checklist |

## Plans & reports

| Doc | What's in it |
|---|---|
| [plans/2026-10-04-business-accounts-plan.md](plans/2026-10-04-business-accounts-plan.md) | Business (company) accounts plan: tasks B1-B12, Log, and the appendix with main's superseded rebuild and the open follow-ups |
| [reports/2026-10-19-business-reconciliation-analysis.md](reports/2026-10-19-business-reconciliation-analysis.md) | Reconciliation of `feat/business-accounts` and main: data model, port list, merge plan, risks, deployment |
| [reports/2026-10-06-business-production-release.md](reports/2026-10-06-business-production-release.md) | Evidence of the 2026-10-06 production release of business accounts |
| [superpowers/plans/2026-10-19-unified-courses.md](superpowers/plans/2026-10-19-unified-courses.md) | P2 plan: unified group courses for individuals, gyms, schools and studios (starts with the P1 reconciliation notes; execution log at the end) |
| [superpowers/specs/2026-10-19-unified-group-courses-design.md](superpowers/specs/2026-10-19-unified-group-courses-design.md) | P2 design spec for the unified group courses |

## Testing

| Doc | What's in it |
|---|---|
| [testing/strategy.md](testing/strategy.md) | Test strategy (unit, integration, E2E with Playwright) |

## Archive

[archive/](archive/) holds historical or point-in-time documents kept for reference but no longer load-bearing: changelogs, implementation plans, completed migrations, snapshot reviews.

---

## Conventions

- **Path references in docs** are relative to the repo root (e.g. `src/styles/globals.css`), not absolute machine paths.
- **`CLAUDE.md`** and **`GEMINI.md`** at the repo root are tool/agent config, not project docs — they intentionally live outside `docs/`.
- **Code-adjacent docs** (e.g. `functions/docs/SEEDING.md`, `src/dataconnect-generated/README.md`, `scripts/README.md`) stay next to their code.

