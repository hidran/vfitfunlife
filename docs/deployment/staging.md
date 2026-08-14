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
| Build | `npm run build` | `npm run build:staging` |
| Deploy | `npm run deploy:prod` | `npm run deploy:staging` |
| Stripe | live keys | **test keys only** |
| Data | real users | synthetic, from the seeders |

`.firebaserc` previously aliased `production` to `vfit-app-prod`, a project that has never
existed. It now points at `vfit-funlife`.

## Every deploy script names its target

```json
"deploy:prod":             "npm run build && firebase deploy -P production --only hosting,firestore,storage",
"deploy:staging":          "npm run build:staging && firebase deploy -P staging --only hosting,firestore,storage",
"deploy:staging:functions":"firebase deploy -P staging --only functions",
"deploy:functions":        "firebase deploy -P production --only functions"
```

The explicit `-P` matters. Without it a deploy follows whatever `firebase use` last
selected, so running `deploy:hosting` after a staging session would push to staging — or a
staging bundle to prod. Each script also rebuilds, because `NEXT_PUBLIC_*` config is baked
into the bundle at build time: deploying `out/` without rebuilding ships whichever project's
config was compiled in last.

## One-time setup (done)

- Project created, web app registered, `.env.staging` written with the staging SDK config
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` left empty — staging traffic in the production
  Analytics property would corrupt the numbers
- `.env.staging` added to `.gitignore`

## One-time setup (needs a human)

These cannot be done from the CLI or an API:

1. **Link a billing account (Blaze).** Required for Cloud Functions, and it turns out also
   for creating the Firestore database via API.
   https://console.firebase.google.com/project/vfit-app-staging/usage/details
2. **Enable Auth providers** to match production: Email/Password, Google, Apple, Phone.
   https://console.firebase.google.com/project/vfit-app-staging/authentication/providers
3. **Stripe test keys.** Put `pk_test_...` in `.env.staging`, and set the server side as
   function secrets (below). Never the live keys — staging would create real charges.

## After billing is on

```bash
# Firestore + Storage + rules + indexes
firebase deploy -P staging --only firestore,storage

# Functions (~90). First deploy enables the required APIs and takes a while.
npm run deploy:staging:functions

# Server secrets — TEST values
firebase functions:secrets:set STRIPE_SECRET_KEY    -P staging
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET -P staging

# Seed. Order matters: categories and user types before providers.
#   seedServiceCategories → seedUserTypes → seedDemoData → seedExerciseLibrary
# All are superadmin-only callables; see scripts/ for the invocation helpers.
```

`clearAllData` resets staging without touching the catalogue, so it can be wiped and
re-seeded freely. That is the point of the environment.

## Gotchas found while building this

- **Firestore location is permanent.** Staging matches production's `nam5`, even though
  functions run in `europe-west1` and every call therefore crosses the Atlantic. Staging
  mirrors that on purpose; fixing it in production would need a data migration.
- **New gen-2 callables 401 for several minutes** after first deploy, from both the
  `cloudfunctions.net` and `run.app` URLs, despite correct `allUsers`/`run.invoker` IAM. It
  clears on its own — don't go debugging permissions that aren't broken.
- **Hosting caches `/_next/static/**` as immutable.** After deploying, a browser holding an
  old bundle will keep running it. Hard-reload before concluding a fix didn't work.
