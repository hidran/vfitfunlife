# V Fitness & Wellness Platform

## Project Overview

A comprehensive hybrid mobile-first fitness and wellness platform with three main verticals:
- **VFit** (fitness): Gyms, classes, personal trainers, home workouts
- **VFun** (entertainment): Events, parties, VR experiences, streaming
- **VLife** (wellness & beauty): Spa, aesthetics, massage, mental wellness

The app serves a fitness center network with multiple activities and venues across Italy.

## RULES
* Always use Context7 MCP when I need library/API documentation, code generation,  
  setup or configuration steps without me having to explicitly ask.
* Refer to .claude/agents agents folder for assistance with complex tasks.
## TECH STACK
### Frontend (Hybrid Web + Mobile)
- **Framework:** Next.js (App Router) with Static Export
- **Styling:** Tailwind CSS v4 (configured via `@tailwindcss/postcss`; no `tailwind.config.ts`)
- **UI Components:** Custom components with shadcn/ui
- **State Management:** Zustand (client stores: auth, booking, provider, admin) + TanStack Query (server state)
- **Forms:** React Hook Form + Zod
- **Maps:** Google Maps (`@react-google-maps/api`)
- **i18n:** Sprint i18n, locale messages in `src/i18n/` — **five locales: it, en, es, fr, de**. Italian is the source locale; `src/i18n/messages/completeness.test.ts` fails on any key missing from any of the five
- **Icons:** Lucide React

### Mobile Packaging
- **Native Wrapper:** Capacitor 
- **Platforms:** iOS, Android, Web (PWA)
- **Native Plugins:**
  - @capacitor/push-notifications
  - @capacitor/geolocation
  - @capacitor/camera
  - @capacitor/haptics
  - @capacitor/share
  - @capacitor/app
  - @capacitor/status-bar
  - @capacitor/keyboard
  - @capacitor/splash-screen

### Backend (Firebase)
- **Authentication:** Firebase Auth (Phone, Email, Google, Apple)
- **Database:** Cloud Firestore
- **Storage:** Firebase Storage
- **Functions:** Cloud Functions for Firebase (Node.js 24, region `europe-west1`)
- **Data Layer:** Firebase Data Connect (GraphQL) — generated client in `src/dataconnect-generated/`
- **Messaging:** Firebase Cloud Messaging (FCM)
- **Analytics:** Firebase Analytics
- **Crash Reporting:** Firebase Crashlytics
- **Remote Config:** Firebase Remote Config

### Payments
- **Provider:** Stripe
- **Integration:** Stripe Elements (web) + Custom UI (mobile)

## Project Structure

```
v-fitness/
├── src/
│   ├── app/                    # Next.js App Router pages
│   ├── components/             # React components
│   ├── contexts/               # React contexts (section theme, etc.)
│   ├── dataconnect-generated/  # Firebase Data Connect generated client
│   ├── hooks/                  # Custom React hooks
│   ├── i18n/                   # Locale messages (it, en, es, fr, de)
│   ├── lib/                    # Libraries & utilities
│   ├── stores/                 # Zustand stores
│   ├── types/                  # TypeScript types
│   └── styles/                 # Global styles
├── public/                     # Static assets
├── functions/                  # Firebase Cloud Functions
├── ios/                        # Capacitor iOS project
├── android/                    # Capacitor Android project
├── docs/                       # Documentation
│   ├── database-schema.md
│   ├── features.md
│   ├── cloud-functions.md
│   └── design-system.md
├── capacitor.config.ts
├── next.config.js
├── tailwind.config.ts
├── firebase.json
├── firestore.rules
└── package.json
```

## Key Commands

```bash
# Development
npm run dev                     # Start Next.js dev server

# Build for production
npm run build                   # Build Next.js static export
npm run export                  # Export to /out folder

# Capacitor
npx cap sync                    # Sync web build to native projects
npx cap open ios                # Open Xcode
npx cap open android            # Open Android Studio
npx cap run ios                 # Build & run on iOS
npx cap run android             # Build & run on Android

# Firebase
npm run deploy:functions        # Deploy Cloud Functions
npm run deploy:rules            # Deploy Firestore rules
npm run deploy:hosting          # Deploy to Firebase Hosting

# Testing
npm run test                    # Run unit tests
npm run e2e                     # Run E2E tests
```

## Environment Variables

```env
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=

# App Config
NEXT_PUBLIC_APP_URL=
```

## Architecture Decisions

1. **Static Export + Capacitor**: Next.js static export ensures the app works offline and can be bundled as a native app. No server-side rendering needed.

2. **Firebase Backend**: Serverless architecture for scalability. Firestore for real-time updates. Cloud Functions for business logic.

3. **Responsive-First Design**: Single codebase adapts from 320px mobile to desktop. Touch-friendly UI with 44px minimum tap targets.

4. **Platform Detection**: Use Capacitor's `Capacitor.isNativePlatform()` to conditionally render native-specific features.

5. **Offline Support**: Critical data cached locally. Bookings queue syncs when online.

## Related Documentation

Start at [`docs/README.md`](docs/README.md) for the full index. Key references:

- `docs/database-schema.md` — Firestore collections & security rules
- `docs/features.md` — Detailed feature requirements & screens
- `docs/backend/cloud-functions.md` — Backend API & Cloud Functions
- `docs/backend/roles-and-permissions.md` — RBAC, Firestore rules, dev API
- `docs/design-system.md` — Brand, tokens, typography, components
- `docs/mobile/capacitor-guide.md` — iOS/Android build via Capacitor
- `docs/deployment/guide.md` — Deployment

## Development Guidelines

1. **Mobile-First**: Always design for mobile viewport first, then enhance for larger screens
2. **Touch Targets**: Minimum 44x44px for all interactive elements
3. **Performance**: Lazy load images, code split routes, optimize bundle size
4. **Accessibility**: WCAG 2.1 AA compliance, proper ARIA labels
5. **Testing**: Write tests for critical user flows (auth, booking, payment
