# V Fitness & Wellness

A hybrid mobile-first fitness and wellness platform serving a fitness center network across Italy. Three product verticals share a single codebase:

- **VFit** — fitness (gyms, classes, personal trainers, home workouts)
- **VFun** — entertainment (events, parties, VR experiences, streaming)
- **VLife** — wellness & beauty (spa, aesthetics, massage, mental wellness)

## Stack

- **Frontend:** Next.js (App Router, static export) + React + TypeScript
- **Styling:** Tailwind CSS v4
- **State:** Zustand (client) + TanStack Query (server) + React Hook Form + Zod
- **Maps:** Google Maps (`@react-google-maps/api`)
- **i18n:** Sprint i18n (`it`, `en`, `es`) in `src/i18n/`
- **Mobile:** Capacitor → iOS, Android, PWA
- **Backend:** Firebase (Auth, Firestore, Storage, Cloud Functions on Node 24, FCM, Analytics, Crashlytics, Remote Config) + Firebase Data Connect
- **Payments:** Stripe

## Quick Start

```bash
# install
npm install

# copy env template and fill in keys
cp .env.example .env.local

# run web dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Common Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (static export) |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run lint` | ESLint |
| `npm run mobile:sync` | Build web + sync to iOS/Android |
| `npm run mobile:open:ios` / `:android` | Open native IDE |
| `npm run deploy:functions` | Deploy Cloud Functions |
| `npm run deploy:rules` | Deploy Firestore rules |
| `npm run seed:quick` | Seed minimal demo data |

Full mobile workflow → [`docs/mobile/capacitor-guide.md`](docs/mobile/capacitor-guide.md).
Full deployment → [`docs/deployment/guide.md`](docs/deployment/guide.md).

## Documentation

All project documentation lives in [`docs/`](docs/README.md). Highlights:

- [Architecture](docs/architecture.md) — system design and decisions
- [Features](docs/features.md) — feature catalog across the three verticals
- [Database Schema](docs/database-schema.md) — Firestore collections and rules
- [Design System](docs/design-system.md) — tokens, components, patterns
- [API Reference](docs/api/reference.md) — cloud function signatures
- [Roles & Permissions](docs/backend/roles-and-permissions.md) — RBAC

Agent-config files (`CLAUDE.md`, `GEMINI.md`) live at the root.

## License

Private — not for redistribution.
