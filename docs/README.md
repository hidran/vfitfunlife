# V Fitness & Wellness — Documentation

Index of project documentation. Each file is the canonical source for its topic; if you're updating something, update the doc.

## Product & Design

| Doc | What's in it |
|---|---|
| [architecture.md](architecture.md) | System architecture, data flow, key technical decisions |
| [preventivo-aggiornato-2026-10-06.md](preventivo-aggiornato-2026-10-06.md) · [PDF](preventivo-aggiornato-2026-10-06.pdf) | Updated scope and development estimate, including company management; original estimate retained for reference |
| [features.md](features.md) | Feature catalog across VFit / VFun / VLife verticals |
| [user-flows.md](user-flows.md) | End-to-end user journeys (auth, booking, payment, etc.) |
| [user-journeys/signup-to-booking.md](user-journeys/signup-to-booking.md) · [Italiano](user-journeys/signup-to-booking.it.md) | Screenshot walkthrough (dark theme, mobile): provider and customer from signup to a confirmed booking, in English and Italian (each also as `.docx`) |
| [user-journeys/business-signup.md](user-journeys/business-signup.md) · [Italiano](user-journeys/business-signup.it.md) | Company signup walkthrough: register as a company with venue type and address, admin approval (the venue is created on approval), search with the Company badge, profile and logo editing, the venue under Gyms & schools, releasing a tax id (venue-step screenshots pending re-shoot) |
| [user-journeys/business-signup-verification.md](user-journeys/business-signup-verification.md) | Main's superseded B10 browser-verification log (defects D1-D16) with a banner showing which the reconciled branch resolves |
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
| [deployment/staging.md](deployment/staging.md) | Staging environment, group-courses release notes and the **Reconciled business release - deployment runbook** (indexes, functions, rules, hosting; staging then production) |

## Plans & reports

| Doc | What's in it |
|---|---|
| [plans/2026-10-04-business-accounts-plan.md](plans/2026-10-04-business-accounts-plan.md) | Business (company) accounts plan: tasks B1-B12, Log, and the appendix with main's superseded rebuild and the open follow-ups |
| [reports/2026-10-19-business-reconciliation-analysis.md](reports/2026-10-19-business-reconciliation-analysis.md) | Reconciliation of `feat/business-accounts` and main: data model, port list, merge plan, risks, deployment |
| [reports/2026-10-06-business-production-release.md](reports/2026-10-06-business-production-release.md) | Evidence of the 2026-10-06 production release of business accounts |
| [superpowers/plans/2026-10-19-unified-courses.md](superpowers/plans/2026-10-19-unified-courses.md) | P2 plan: unified group courses for individuals, gyms, schools and studios (starts with the P1 reconciliation notes) |

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

- [Group courses: provider creation, customer bookings and payments](user-journeys/group-courses.md)
