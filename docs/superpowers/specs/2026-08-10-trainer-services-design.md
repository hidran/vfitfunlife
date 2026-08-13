# Trainer-Managed Services — Design Spec

**Date:** 2026-08-10
**Status:** Approved (design)
**Author:** Hidran Arias (with Claude Code)

## 1. Summary

A trainer reported: *"As a trainer, I see no way of adding services I provide from my profile."*

The complaint is literally true, and the underlying feature is broken end-to-end rather than
merely undiscoverable. `/provider/services` exists, is linked from the provider sidebar, and
persists nothing: every handler mutates local React state. Existing services render with blank
titles. Nothing on `/profile` points a verified provider at the provider area at all.

This spec makes a trainer's service list real: stored, editable, and visible to clients.

## 2. The three failures

**(a) Zero discoverability.** `BecomeProviderCard.tsx` bails with `if (role !== 'customer')
return null` before its `verified` branch can render, so the only profile → provider-dashboard
link disappears for exactly the people who need it. The side drawer's professional-mode pill is
two `<div>`s with no `onClick`, and its nav has no `/provider/*` entry — while admins get a
gradient `/admin` button. The profile's "Public profile" button pushes `/provider/{uid}`, which
is not a route and cannot be one under `output: 'export'`.

**(b) The page never persists.** `handleAddService`, `handleToggleActive`, `handleDuplicate`,
`handleDelete` and `handleSaveEdit` all call `setDisplayServices(...)` and stop. A refresh
discards everything. The load path reads the right collection but casts the shape away:

```ts
setDisplayServices(firestoreServices as unknown as ProviderService[]);
```

That cast is what hides the mismatch — the page renders `service.serviceName` while the
documents store `name`, so every pre-existing service shows a blank title. The card also
renders `categoryName`, `bookingCount` and `revenue`, none of which exist in the data.

**(c) Two competing service systems.** `instructors/{uid}/services` holding `InstructorService`
is the live source of truth the client booking flow reads. A top-level `services` collection
holding `ProviderService` is written by `providerStore` and `src/lib/firebase/provider.ts`,
has **no rule in `firestore.rules`** (so those writes are deny-by-default), and is read by
nothing. Its only consumer is the broken page.

## 3. One shape, one collection

`instructors/{uid}/services` is the only service store. `InstructorService` is the only type:

```ts
export interface InstructorService {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
}
```

This is the shape the seed writes and the booking flow already reads, so **no data migration is
required** — the divergence lived entirely in unused code. `ProviderService` is deleted.

## 4. Data layer

Three functions added to `src/lib/firebase/providers.ts`, beside the existing
`fetchProviderServices`:

| Function | Writes |
|---|---|
| `createProviderService(providerId, data)` | `addDoc(instructors/{providerId}/services)` |
| `updateProviderService(providerId, serviceId, data)` | `updateDoc(.../services/{serviceId})` |
| `deleteProviderService(providerId, serviceId)` | `deleteDoc(.../services/{serviceId})` |

No `providerId` field on the document; the path carries it. `firestore.rules:333-337` already
permits the owning trainer to write this subcollection, so **no rules change is needed**.

Mutation hooks go in `src/hooks/useProviders.ts` next to `useProviderServices`, following the
`useUpdateProviderPhotos` pattern. Each invalidates `['provider-services', providerId]`, plus
`['provider', providerId]` and `['providers']` so a refreshed `lowestPrice` reaches the cards.

## 5. The services page

`src/app/(main)/provider/services/page.tsx` is rewritten to drive those mutations.

- `displayServices` state and `nextServiceIdRef` are deleted; the list renders straight off
  `useProviderServices(uid)`.
- The `as unknown as ProviderService[]` cast goes away, along with the `useProviderStore()`
  services calls.
- Add / edit / delete / toggle / duplicate each call a mutation. Buttons disable while pending;
  failures surface inline rather than silently reverting.
- Card body: name, description, price, duration, active badge. The `categoryName` line and the
  bookings/earnings footer are removed — they render fields that have never existed.
- An empty state replaces the bare grid when a trainer has no services, which is precisely the
  state the reporting trainer was stuck in.
- The Gallery tab (`PhotoUploader` + `useUpdateProviderPhotos`) is untouched; it already works
  and is the pattern the rest of the page is being brought in line with.

Delete is unconditional. The old guard tested `bookingCount === 0` against a field that does not
exist, so it was decided by `undefined` coercion rather than by data. Trainers retiring a booked
service should deactivate it; inventing a booking-lookup guard is out of scope here.

Duplicate is kept, now costing a Firestore write rather than a free local clone — worth it for
trainers maintaining several near-identical packages.

## 6. `lowestPrice` trigger

The instructor document carries a denormalized `lowestPrice`, consumed by the "Da €N" card label
(`booking/page.tsx:427`), provider **price sorting** (`firebookings.ts:124`) and AI search cards
(`ai/search/mapCards.ts:41`). Without maintenance, a trainer editing services would silently
desynchronise all three.

**`functions/src/providers/onServiceWrite.ts`**, exported from `functions/src/index.ts`:

`onDocumentWritten('instructors/{instructorId}/services/{serviceId}')`, region `europe-west1`.
Reads the sibling services, computes `min(price)` over **active** services only, merges
`{ lowestPrice, hourlyRate }` onto the instructor document. When no active service remains, both
fields are removed with `FieldValue.delete()` so cards fall back cleanly instead of advertising
€0.

A trigger rather than client-side recomputation: it stays correct for admin edits, seeds and
migrations, not only for writes originating from this page, and the Admin SDK bypasses the rule
that would otherwise stop a trainer from writing their own root document fields.

## 7. Discoverability

| File | Change |
|---|---|
| `src/components/profile/BecomeProviderCard.tsx` | Move the `role !== 'customer'` guard below the `verified` branch, so a verified provider keeps a card linking to `/provider/dashboard`. The `cta` / `pending` / `rejected` branches stay customer-only. |
| `src/components/layout/SideDrawer.tsx` | Add a provider button mirroring the existing admin gradient button, shown in professional mode, linking to `/provider/dashboard`. |
| `src/app/(main)/profile/page.tsx` | `/provider/${user?.id}` → `/book?providerId=${user?.id}` — the real public trainer page, matching the query-string convention static export forces. |

## 8. One bug this exposes

`src/app/book/BookingClient.tsx:236` maps over `services` with no `isActive` filter, so
deactivated services are still offered to clients. The filter is added here, because otherwise
the toggle this spec makes functional still does nothing observable.

## 9. Deletions

- `getProviderServices`, `createService`, `updateService`, `deleteService` from
  `src/lib/firebase/provider.ts`, and their re-exports in `src/lib/firebase/index.ts`
- the `services` / `isLoadingServices` slice and its four actions from `src/stores/providerStore.ts`
- `ProviderService` from `src/types/provider.ts`

The broken page is the sole consumer of all of these, so removal is safe.

## 10. i18n

Remove `provider.services.card.bookings` and `provider.services.card.earned`. Add keys for the
empty state, save/delete failure, pending states, the profile provider card and the drawer
label. Italian is the source locale; all five (it, en, es, fr, de) must be complete or
`src/i18n/messages/completeness.test.ts` fails.

## 11. Testing

| Level | Coverage |
|---|---|
| Unit | The three new CRUD functions in `src/lib/firebase/providers.test.ts` against the mocked Firestore |
| Unit | Trigger: min over active services only; last active service removed → fields deleted |
| Manual | Playwright: reach `/provider/services` from `/profile`, add a service, **reload**, confirm it persisted, confirm it appears on `/book?providerId=…`, deactivate, confirm it disappears |

## 12. Definition of done

- A trainer can add, edit, duplicate, deactivate and delete services, and they survive a reload.
- Existing services render their real names.
- `lowestPrice` tracks the cheapest active service without client involvement.
- A verified provider can reach the provider area from both `/profile` and the side drawer.
- The dead `services` collection path no longer exists in the codebase.
- Five locales complete; build and tests green.
