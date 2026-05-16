# Project Overview

This is a Next.js application built with TypeScript, using Firebase for backend services. It's a hybrid app that can be deployed as a web application and as a native mobile app using Capacitor. The project is named "vfit" and is a fitness and wellness platform with three verticals: VFit, VFun, and VLife.

## Key Technologies

*   **Frontend:** Next.js (App Router, static export), React, TypeScript
*   **Backend:** Firebase (Auth, Firestore, Storage, Functions on Node.js 24, FCM, Analytics, Crashlytics, Remote Config)
*   **Mobile:** Capacitor (iOS, Android, PWA)
*   **Styling:** Tailwind CSS v4 (configured via `@tailwindcss/postcss`; no `tailwind.config.ts`)
*   **Maps:** Google Maps (`@react-google-maps/api`)
*   **Payments:** Stripe
*   **i18n:** Sprint i18n with locale messages in `src/i18n/` (it, en, es)
*   **Testing:** Vitest, Playwright
*   **Data Layer:** Firebase Data Connect (GraphQL) — generated client in `src/dataconnect-generated/`
*   **State Management:** Zustand stores + TanStack Query for server state
*   **Forms:** React Hook Form + Zod

## Project Structure

*   `src/app/`: The main application code, structured using Next.js App Router.
    *   `src/app/(main)/`: Contains the core features of the app: `bookings`, `fit`, `home`, `profile`, `search`, and `venue`.
    *   `src/app/auth/`: Handles user authentication.
    *   `src/app/onboarding/`: Manages the user onboarding process.
*   `dataconnect/`: Contains the GraphQL schema and other configurations for Firebase Data Connect.
*   `functions/`: Firebase Functions code.
*   `public/`: Static assets.
*   `docs/`: Project documentation, organized by domain. Start at [`docs/README.md`](docs/README.md) for the index. Notable areas:
    *   `docs/wireframe/`: HTML mockups and screenshots used as frontend design references.
    *   `docs/features.md`: Feature requirements / implementation checklist.
    *   `docs/architecture.md`, `docs/database-schema.md`, `docs/design-system.md`: Core technical references.
    *   `docs/api/`, `docs/backend/`, `docs/mobile/`, `docs/deployment/`, `docs/testing/`: Domain-specific docs.

# Building and Running

## Development

To run the application in development mode, use the following command:

```bash
npm run dev
```

## Building

To build the application for production, use the following command:

```bash
npm run build
```

This will create a static export of the application in the `out` directory.

## Testing

The project uses Vitest for unit testing and Playwright for end-to-end testing.

*   To run unit tests:
    ```bash
    npm run test
    ```
*   To run unit tests with UI:
    ```bash
    npm run test:ui
    ```
*   To run end-to-end tests:
    ```bash
    npm run test:e2e
    ```
*   To run end-to-end tests with UI:
    ```bash
    npm run test:e2e:ui
    ```

# Deployment

The project is deployed to Firebase.

*   To deploy Firebase Functions:
    ```bash
    npm run deploy:functions
    ```
*   To deploy Firestore rules:
    ```bash
    npm run deploy:rules
    ```
*   To deploy to Firebase Hosting:
    ```bash
    npm run deploy:hosting
    ```

# Development Conventions

*   The project follows the standard Next.js project structure.
*   Styling is done using Tailwind CSS.
*   State management is handled by Zustand.
*   The data layer is managed by Firebase Data Connect with a GraphQL schema.
*   The project uses TypeScript for type safety.

# AI Personas and Subagents

This project uses AI personas and subagents to assist with development.

*   **`CLAUDE.md`**: This file contains the high-level project overview, technical stack, and rules for the main AI assistant. It provides the core context for any development task.
*   **`.claude/agents/`**: This directory contains specialized AI subagents, each with a specific role (e.g., `api-designer`, `code-reviewer`, `database-planner`). These agents can be invoked to perform complex tasks that require specific expertise. Refer to the files in this directory for instructions on how to use them.
