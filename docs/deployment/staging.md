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

## Re-seeding

```bash
# from scratch, in this order — categories and user types before providers
seedServiceCategories → seedUserTypes → seedExerciseLibrary → seedDemoData
→ backfillServiceCategories {"apply":true}
```

All are superadmin-only callables at
`https://europe-west1-vfit-app-staging.cloudfunctions.net/<name>`, called with a Firebase
ID token for `admin@vfit.com`. `clearAllData` wipes demo content so the environment can be
rebuilt freely — that is the point of it.

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
