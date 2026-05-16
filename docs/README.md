# V Fitness & Wellness — Documentation

Index of project documentation. Each file is the canonical source for its topic; if you're updating something, update the doc.

## Product & Design

| Doc | What's in it |
|---|---|
| [architecture.md](architecture.md) | System architecture, data flow, key technical decisions |
| [features.md](features.md) | Feature catalog across VFit / VFun / VLife verticals |
| [user-flows.md](user-flows.md) | End-to-end user journeys (auth, booking, payment, etc.) |
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
