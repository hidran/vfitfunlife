import type { AppLocale } from '@/types/locale';

/**
 * Centralized TanStack Query key factories (P2-7).
 *
 * Keeping keys in one place avoids typo'd/duplicated cache entries across components and
 * makes `invalidateQueries` calls after a mutation greppable. Every factory returns a
 * `readonly` tuple so it can be passed straight into `queryKey` / `invalidateQueries`.
 *
 * Convention: `[domain, ...params]`. Admin entities reuse the same top-level key the admin
 * list views already invalidate on (e.g. `['users']`, `['providers']`) so a single
 * `invalidateKeys` entry busts both the list and the detail cache.
 */

export const queryKeys = {
  // Public provider profile (src/app/providers/detail/ProviderProfileClient.tsx)
  providerPublicProfile: (providerId: string) => ['provider-public-profile', providerId] as const,

  // Booking detail pages — wrap the existing Zustand store fetch actions so remounts are
  // deduped/cached instead of always re-fetching (src/stores/bookingStore.ts /
  // src/stores/providerStore.ts keep owning the actual data + loading/error state).
  userBookings: (uid: string | undefined) => ['user-bookings', uid] as const,
  providerBookings: () => ['provider-bookings'] as const,
  // Roster entry for a booking's customer (provider booking detail → client profile link).
  providerClientForUser: (providerId: string | undefined, userId: string | undefined) =>
    ['provider-client-for-user', providerId, userId] as const,

  // Client "Le mie schede" plans screen (src/app/(main)/plans/PlansClient.tsx)
  myWorkoutPlans: (uid: string | undefined) => ['my-workout-plans', uid] as const,
  planProgress: (clientId: string | undefined, planId: string | undefined) =>
    ['plan-progress', clientId, planId] as const,
  // Global reference data (not user- or plan-scoped) — P2-8: was an unbounded, uncached read
  // on every mount; a long staleTime is the fix rather than limit(), since a hard cap would
  // silently break label lookups for exercises past the cutoff.
  exerciseLibrary: () => ['exercise-library'] as const,

  // Client recipes screen (src/app/(main)/recipes/RecipesClient.tsx). `recipesMine` is also
  // reused by the provider's own recipe library (RecipesLibraryClient) — `listMyRecipes()`
  // is scoped server-side by the caller's own uid, so the same unparameterized key is safe
  // for both surfaces (each session only ever sees its own data under it).
  recipesSharedWithMe: () => ['recipes', 'shared-with-me'] as const,
  recipesMine: () => ['recipes', 'mine'] as const,
  // What the provider has shared with one specific client (RecipesTab.tsx).
  recipesSharedWithClient: (clientUserId: string | undefined) =>
    ['recipes', 'shared-with-client', clientUserId] as const,

  // Provider "client detail" tabs (src/app/(main)/provider/clients/detail/tabs/).
  clientGoals: (clientId: string) => ['client-goals', clientId] as const,
  clientTrainingPrograms: (clientId: string) => ['client-training-programs', clientId] as const,

  // Pilot feature flags (Remote Config) — read by the public /fun and /life section guards.
  pilotFlags: () => ['pilot-flags'] as const,

  // Admin settings panels (src/components/admin/settings/).
  aiAssistantSettings: () => ['ai-assistant-settings'] as const,
  aiAuthoringSettings: () => ['ai-authoring-settings'] as const,

  // Admin "Cruscotto" dashboard (src/app/admin/metrics/MetricsClient.tsx).
  metricsDaily: (days: number) => ['metrics-daily', days] as const,
  metricsGates: () => ['metrics-gates'] as const,

  // Provider applications review panel (src/components/admin/ProviderApplicationsPanel.tsx).
  providerApplications: () => ['provider-applications'] as const,

  // Admin detail views — first element matches the list views' existing invalidation key.
  adminPayment: (paymentId: string) => ['transactions', paymentId] as const,
  adminUserType: (userTypeId: string) => ['userTypes', userTypeId] as const,
  adminBooking: (bookingId: string) => ['bookings', bookingId] as const,
  adminProvider: (providerId: string) => ['providers', providerId] as const,
  adminServiceCategory: (serviceCategoryId: string) =>
    ['serviceCategories', serviceCategoryId] as const,
  adminVenue: (venueId: string) => ['venues', venueId] as const,
  adminUser: (userId: string) => ['users', userId] as const,

  // Service categories (P2-8) — categories rarely change, so a single long-staleTime query
  // (the full catalogue) backs both the client "active only" views and the admin "everything"
  // view instead of two separate unbounded reads of the same collection.
  serviceCategoriesAll: (locale: AppLocale) => ['serviceCategories', 'all', locale] as const,
} as const;
