# Project Overview

This is a Next.js application built with TypeScript, using Firebase for backend services. It's a hybrid app that can be deployed as a web application and as a native mobile app using Capacitor. The project is named "vfit" and appears to be a fitness and wellness application.
Refer to 

## Key Technologies

*   **Frontend:** Next.js, React, TypeScript
*   **Backend:** Firebase (Firestore, Functions)
*   **Mobile:** Capacitor
*   **Styling:** Tailwind CSS
*   **Testing:** Vitest, Playwright
*   **Data Layer:** Firebase Data Connect (GraphQL)
*   **State Management:** Zustand

## Project Structure

*   `src/app/`: The main application code, structured using Next.js App Router.
    *   `src/app/(main)/`: Contains the core features of the app: `bookings`, `fit`, `home`, `profile`, `search`, and `venue`.
    *   `src/app/auth/`: Handles user authentication.
    *   `src/app/onboarding/`: Manages the user onboarding process.
*   `dataconnect/`: Contains the GraphQL schema and other configurations for Firebase Data Connect.
*   `functions/`: Firebase Functions code.
*   `public/`: Static assets.
*   `docs/`: Project documentation. This directory contains various documentation files. Notably:
    *   Subfolders within `docs/` (e.g., `docs/login_screen/`, `docs/my_bookings_list/`): These folders contain HTML mockups (`code.html`) and screenshots (`screen.png`, `wireframe.jpeg`, etc.) that serve as design references for the frontend UI. The HTML files can be opened directly in a browser to visualize the intended design.
    *   `docs/features.md`: This file outlines the feature requirements for the application. It acts as a checklist for implemented features and can be used to track progress.

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
