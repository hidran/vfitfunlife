# User journeys

Step-by-step journeys for every kind of user, written against the code as of 20 October 2026 (routes, button labels, callables and error texts were checked in `src/` and `functions/src/`). Each journey has a **Goal**, **Preconditions**, numbered **Steps** (screen, action, result), what the user sees on **errors** (the real texts of `courses.err.*` in `src/lib/courseErrors.ts` and of the business error tables in `src/lib/providerApplicationErrors.ts`), **edge cases**, and a **Known limitations** section. Other entry points: [user flows](../user-flows.md) (generic flows), [features](../features.md) (what exists).

Language: guides are in English. Italian twins exist for the signup-to-booking guide, the company signup, the company owner's venue journey and a customer summary of group courses (marked *IT*).

## Customer

| Journey | What it covers |
|---|---|
| [Signup to booking](signup-to-booking.md) · [IT](signup-to-booking.it.md) | Customer Part B: register, search, book a one-to-one appointment, see it confirmed. (Part A is the individual provider's side.) |
| [Find a lesson](group-courses.md#a1-find-a-lesson) | Gyms & schools, venue page, weekly timetable, course list, search |
| [Book a lesson or a whole course](group-courses.md#a2-reserve-one-lesson) · [full course](group-courses.md#a3-enroll-in-the-whole-course) | Price review, confirm, errors, free and paid |
| [Discounts and price changes](group-courses.md#a4-see-why-a-price-differs) | Venue and partner instructor benefits, the "price changed" re-review |
| [Waitlist and promotion](group-courses.md#a5-join-the-waitlist-and-get-promoted) | Join, position, automatic booking or 30-minute payment hold, leave |
| [My course bookings, cancelling, refunds](group-courses.md#a6-my-course-bookings-and-cancelling) | Cancel before the deadline, late cancellation, no-show, refunds |
| [Online payment](group-courses.md#a7-pay-online-optional) | Optional Stripe checkout |
| [Riepilogo in italiano](group-courses.it.md) (*IT*) | The customer part of group courses in Italian |

## Individual provider

| Journey | What it covers |
|---|---|
| [Signup to approval](signup-to-booking.md) (Part A) and [group-courses.md B1](group-courses.md#b1-become-a-provider-and-get-approved) | Register as an individual, automatic approval or pending queue, first service |
| [Create and publish a course without a venue](group-courses.md#b2-create-and-publish-a-course-without-a-venue) | The course form, preview, publish, locks once booked |
| [Roster, attendance, direct payment](group-courses.md#b3-roster-attendance-and-direct-payment) · [add participants](group-courses.md#provider-adds-participants) | Who is coming, present/absent, record payment, add someone |
| [Lesson actions, cancellations and refunds](group-courses.md#b5-lesson-actions) · [refunds](group-courses.md#b6-cancellations-and-refunds) | Reschedule, cancel, capacity, remove participant, refund due |

## Company owner

| Journey | What it covers |
|---|---|
| [Register and book a company](business-signup.md) · [IT](business-signup.it.md) | Company signup with tax id, legal form, venue type and address; pending review; approval; public listing with the Business badge (Italian *Azienda*); profile and logo editing |
| [The venue and its courses](company-owner-venue.md) · [IT](company-owner-venue.it.md) | The venue created on approval, locations and rooms, partner status and instructors (set by admin), publishing venue courses with room and instructor locks, staff, rejection / conversion / deletion |

## Venue staff and managers

| Journey | What it covers |
|---|---|
| [Venue staff](venue-staff.md) | Entry through the **Venue courses** tab, managing a venue's courses on behalf of the owner, lesson actions (reschedule with room, substitute instructor, capacity, remove participant, remove from waitlist, cancel), roster, attendance, payments, refunds |

## Admin and superadmin

| Journey | What it covers |
|---|---|
| [Companies, venues and course settings](admin-business-and-venues.md) | Review a company (approve what you saw), tax-id correction, release a claim, convert to individual, venues list with owner, partner status and discounts, instructor links, staff records, user-deletion effects, automatic approval, Stripe and course-checkout switches |
| [Browser verification of the reconciled business release](business-reconciled-verification.md) | The 20 October 2026 staging run (defects, evidence); supersedes the log below |
| [Main's earlier verification log](business-signup-verification.md) | Superseded B10 run (defects D1-D16) with a status banner |
| [Production release checklist](production-release-checklist.md) | Test checklist of the 2026-10-06 business release |

## Visitor

There is no public journey inside the app beyond the landing page, sign-in and registration, and the public provider pages (`/providers/detail`, `/book`). The Gyms & schools list, the venue pages, the weekly timetable and the course list are all behind sign-in: `src/app/(main)/layout.tsx` redirects a signed-out visitor to `/auth/login` (without a return address), so the signed-out views the components support (regular price, "sign in, then come back to this lesson") cannot be reached today. This is by code reading and has not been re-checked in a browser. A visitor starts with [signup to booking](signup-to-booking.md) (Part B) or [Register a company](business-signup.md).

## Other

- [Partner-gym timetable](partner-gym-timetable.md): stub; the old separate flow is superseded by group courses and is being removed.

## Screenshots status

| Journey | State |
|---|---|
| Signup to booking | **Exists.** 17 customer and 16 provider mobile screens (390 x 844, dark, English) in `screenshots/`, Italian twins in `screenshots-it/`, recorded 30 September and 1 October 2026; the guide is also built as `.docx` (English and Italian) |
| Company signup, admin review, venue on approval | **Exists.** 42 PNGs in `business-screenshots/` (5 October 2026 run and the 20 October reconciled re-shoot: signup errors, pending, duplicate, review card with venue type and address, Admin → Venues with Owner, venue detail, Gyms & schools after Near me, venue page, venue switched off after conversion, badges at 320 px, booking detail, profile). Not covered: the three correction dialogs (change tax id, release claim, convert) |
| Group courses: customer (timetable, review, price changed, waitlist, cancel, series), owner's venue courses page, roster and record-payment dialog | **In progress, not committed or embedded.** When this index was written an untracked capture run was adding `courses-NN-*.png` files (01-27) to `screenshots/` and `screenshots-it/`. They are not linked from the guides yet |
| Group courses: provider course editor, venue instructor picker, lesson action forms (reschedule with room, substitute, capacity, remove participant), refunds list | **Pending** (not seen in the capture run) |
| Locations and rooms panel, venue staff entry tab ("Venue courses"), staff roster | **Pending** |
| Admin: instructor-link panel, venue edit form with partner status and discounts, payment switches, user deletion | **Pending** |

## Conventions

- Journeys name screens by their English UI text and route; Italian guides use the Italian texts. Error texts are quoted from the message files; a code the app does not know shows "Action failed. Check the details and try again." (Italian: "Operazione non riuscita. Controlla i dati e riprova.")
- Claims that depend on a deployment (Stripe secrets on staging, what is live) are marked as such; they cannot be checked in code. See [staging deployment](../deployment/staging.md).
