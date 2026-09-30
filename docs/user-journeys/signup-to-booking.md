# VFit: Signup-to-Booking User Journeys

How a **provider** (trainer) and a **customer** get from creating an account to a confirmed appointment, step by step, with a screenshot of every screen.

*Italian version: [signup-to-booking.it.md](signup-to-booking.it.md).*

| | |
|--------|----------------------------|
| **Recorded** | 30 September 2026 (second recording, after the responsive pass), against the staging backend (`vfit-app-staging`), app built from `main` @ `9f9af27` |
| **Device** | Mobile viewport 390 × 844 (iPhone 12/13/14 size). Long screens are captured at full height |
| **Theme** | Dark |
| **Language** | English (the app also ships in Italian, Spanish, French and German) |
| **Provider used** | Davide Moretti, `journey.en.provider@vitfitdemo.dev` |
| **Customer used** | Elena Gallo, `journey.en.customer@vitfitdemo.dev` |
| **Resulting booking** | `Dfi6vOZj7RoHLRkQkNn0`: Personal Training, Fri 2 Oct 2026, 10:00–11:00, €50 |

Both accounts were created fresh for this walkthrough. Nothing in it was seeded or mocked.

---

## The two journeys at a glance

The two journeys meet at the booking request. The provider must be live, with at least one active and priced service, before a customer can book them.

| # | Provider (trainer) | Customer |
|--|------------------|------------------|
| 1 | Opens the landing page → **Register as a provider** | Opens the landing page → **Register as a customer** |
| 2 | Fills in the signup form and ticks **I also want to offer services as a professional**, picking the services they offer | Chooses a signup method (email, Google, Apple, phone/SMS) and fills in the signup form |
| 3 | Is approved on the spot: role `provider`, verified, default Mon–Fri 09:00–17:00 hours, one inactive draft service per chosen category | Lands on Home |
| 4 | Sets a price on a draft service and activates it | Opens **Book a service**, finds the trainer (search, category or **Near me**) |
| 5 | Checks their availability and sets a location so they appear in **Near me** searches | Opens the trainer's page, picks a service, a date and a time slot |
| 6 | | Reviews the booking, accepts the terms and taps **Confirm**. The booking is created as a *request* |
| 7 | Gets a **New booking request** notification and **confirms** the booking | |
| 8 | Sees the appointment under *Upcoming Appointments* | Gets a **Booking accepted** notification. The booking shows as **Confirmed** |

**Booking status lifecycle covered here:** `requested` ("Awaiting confirmation") → `accepted` ("Confirmed"). The later statuses (completed, cancelled, reviewed) are outside the scope of this document.

**Payment:** at this stage customers pay the trainer directly, in person or as agreed (cash, Satispay, bank transfer). Nothing is charged in the app. After the session the trainer records the payment.

---

## Part A: Provider journey

### A1. Landing page

The visitor opens the app. The hero offers two entry points: **Register as a customer** and **Register as a provider**. The provider taps **Register as a provider**.

![Landing page](screenshots/provider/01-landing.png)

### A2. Signup form (provider mode)

**Register as a provider** opens `/auth/register?as=provider`. It goes straight to the email signup form, with the professional opt-in already ticked. The header has the language picker and the light / dark / system theme switch.

![Empty provider signup form](screenshots/provider/02-register-start.png)

### A3. Personal details

The provider enters:

- **Full name** and **Email** (required)
- **Password** and **Confirm password**. The live checklist requires at least 12 characters, a lowercase letter, an uppercase letter, a number and a symbol.
- **Date of birth** (optional)
- **What interests you the most?**: VFit, VFun or VLife (here: VFit)

![Provider details filled in](screenshots/provider/03-register-details.png)

### A4. Professional opt-in and services offered

With **I also want to offer services as a professional** ticked, the provider picks the services they offer from the platform catalogue. They choose a category (e.g. *Strength & Conditioning*) and then one or more services. Here: **Personal Training** and **Functional Training**. They accept the Terms of Service and Privacy Policy and tap **Create account**.

![Professional opt-in with two services selected](screenshots/provider/04-register-professional-optin.png)

> **What happens behind the scenes.** Provider auto-approval is on by default (`systemSettings/providerOnboarding.autoApprove`, switchable on `/admin/providers`), so the `applyAsProvider` function approves the account immediately:
> role `provider`, verified provider profile, default Mon–Fri 09:00–17:00 availability, and one **inactive, €0 draft service** for each service picked. If an admin switches auto-approval off, the application goes to a pending queue instead.

### A5. Permissions

After signup the app asks for **Location** (to find nearby gyms, events and services) and **Notifications** (booking updates). Both are optional. The provider can allow them or tap **Skip for now**.

![Permissions screen](screenshots/provider/05-permissions.png)

### A6. Provider dashboard

The provider lands directly in the **Provider portal**. The dashboard confirms they are already bookable (*"You're bookable Mon–Fri 9:00–17:00 — check your hours"*) and suggests adding a location. A **Confirm your email** banner above the *Provider portal* bar asks them to click the verification link sent to their inbox. It does not block anything in this journey.

![Provider dashboard on first login](screenshots/provider/06-provider-dashboard.png)

### A7. Services: the drafts created at signup

**Provider portal → Services** lists one draft per service chosen at signup. Drafts are **Inactive** at **€0**, so customers cannot book them until the provider sets a price.

![Services list with two inactive drafts](screenshots/provider/07-services-drafts.png)

### A8. Open the service actions

The **⋮** menu on a service card offers **Edit**, **Duplicate**, **Activate** and **Delete**. The provider opens it on *Personal Training* and taps **Edit**.

![Service actions menu](screenshots/provider/08-service-actions-menu.png)

### A9. Price and activate the service

In **Edit Service** the provider adds a description, sets **Price (€)** to **50** and keeps **Duration** at **60 min**. They tick **Service is active** and tap **Save Changes**.
(New services can also be added with **Add Service**, either from the catalogue or as a custom service.)

![Edit Service dialog](screenshots/provider/09-edit-service-form.png)

### A10. The service is live

*Personal Training* now shows **€50 / 60 min** and its description, with no *Inactive* badge. The provider appears in search results with **From 50,00 €**.

![Personal Training active at €50](screenshots/provider/10-service-active.png)

### A11. Availability (optional check)

**Provider portal → Availability** shows the weekly schedule created at signup: Monday to Friday, one slot each (09:00–17:00), weekends off. It also has general settings:

- **Buffer Time**: 15 minutes
- **Min. Advance Notice**: 24 h
- **Max Bookings per Day**: 8
- **Timezone**: Europe/Rome

**Date Overrides** covers holidays and one-off changes.

![Availability settings](screenshots/provider/11-availability.png)

### A12. Location (recommended)

**Provider portal → Location** sets where the provider works. They search an address (here *Piazza Gae Aulenti, Milano*), fine-tune the pin on the map, check the **City** and tap **Save location**. The confirmation reads *"Location saved: you now show up in 'near me' searches."* Only an approximate position (~100 m) is stored.

![Location picker](screenshots/provider/12-location.png)

> Customers can find the provider by typing their name even without a location. The location adds them to **Near me** results and shows the distance.

*The provider is now live. [Part B](#part-b-customer-journey) shows the customer booking them. The provider's side then resumes at A13.*

### A13. New booking request notification

When the customer books, the bell shows an unread badge. **Notifications** shows *"New booking request — Elena Gallo requested Personal Training (Fri, Oct 2, 10:00 AM). Accept or decline it in the app."*

![New booking request notification](screenshots/provider/13-new-booking-notification.png)

### A14. Bookings: the request awaiting confirmation

**Provider portal → Bookings** shows each booking as a card on a phone: client name and email, status **AWAITING CONFIRMATION**, service and duration, date, time and price, with the **Confirm** and **Decline** buttons always visible. The tabs filter by All, Pending, Confirmed, Completed and Cancelled; there is also a client-name search, **Filters** and **Export**.

![Provider bookings, request awaiting confirmation](screenshots/provider/14-booking-request-list.png)

### A15. Confirm the booking

The provider taps **Confirm**. The button shows a spinner, then the card switches to **CONFIRMED** and a toast reads *"Booking confirmed: the client will be notified."* The card action becomes **Complete**, which is used after the session.

![Booking confirmed](screenshots/provider/15-booking-accepted.png)

### A16. Dashboard: upcoming appointment

The dashboard now counts **1** under *This Week's Bookings*. *Upcoming Appointments* lists **Oct 2 · 10:00 AM · Elena Gallo · Personal Training · Confirmed**, with a **Details** button.

![Dashboard with the upcoming appointment](screenshots/provider/16-dashboard-upcoming.png)

---

## Part B: Customer journey

### B1. Landing page

The visitor taps **Register as a customer**.

![Landing page](screenshots/customer/01-landing.png)

### B2. Choose a signup method

Customers choose how to sign up: **Email and Password**, **Google**, **Apple** or **Phone (SMS)**. This walkthrough uses email.

![Signup method picker](screenshots/customer/02-signup-method.png)

### B3. Signup form

This is the same form the provider used, but with the professional opt-in **unticked**.

![Empty customer signup form](screenshots/customer/03-register-email-form.png)

### B4. Fill in and create the account

The customer enters their name, email, a password that meets all five rules, an optional date of birth and their main interest (VFit). They accept the Terms of Service and Privacy Policy and tap **Create account**.

![Customer signup form filled in](screenshots/customer/04-register-filled.png)

### B5. Permissions

This is the same optional Location and Notifications step as the provider's. The customer taps **Skip for now**. Allowing location here makes **Near me** one tap later.

![Permissions screen](screenshots/customer/05-permissions.png)

### B6. Home

The customer lands on **Home**, which shows gyms and locations, active classes, the VFit map and *Find your online coach*. The same **Confirm your email** banner appears.

![Customer home](screenshots/customer/06-home.png)

### B7. Book a service

The **Book now** button (centre of the bottom bar) or **Search** opens **Book a service** (`/booking`). The customer can:

- search by trainer or service name
- filter by category (Strength & Conditioning, Cardio & Endurance, Combat Sports, Mind & Body, Dance & Group, Therapy & Recovery, Nutrition & Lifestyle, Mental Wellness) and with **Filters**
- use **Near me** with a radius (5 / 10 / 25 / 50 km / All)
- switch between list and map view

![Book a service](screenshots/customer/07-booking-search.png)

### B8. Find the trainer

The customer taps **Near me**, which uses the device location (here near Porta Nuova, Milan) with a default radius of 25 km, and types the trainer's name. **Davide Moretti** appears first, **0.1 km** away, marked **VERIFIED**, **From 50,00 €**. (A seeded trainer with the same name shows up further down, 1.3 km away.) They tap **Check availability**.

![Near-me result for the trainer](screenshots/customer/08-near-me-results.png)

### B9. Trainer page: select a service

The trainer's page (`/book?providerId=…`) has **Services**, **Reviews** and **About** tabs and the **Message** and **Check availability** buttons. Under *Select a service* the customer taps **Select** on *Personal Training (1 h, 50,00 €)*.

![Trainer booking page](screenshots/customer/09-provider-booking-page.png)

### B10. Pick a date

The calendar opens on the current month. The provider requires 24 h notice, so the customer moves to **October** with the › arrow and taps **Friday 2**. Only days with at least one free slot can be tapped: weekends, days off and days inside the notice period are greyed out (they pulse briefly while the calendar checks the month).

![Date picker](screenshots/customer/10-pick-date.png)

### B11. Pick a time

*Available times* lists the free 30-minute start times, grouped into **Morning** and **Afternoon** (Europe/Rome time). The customer picks **10:00**. The footer summarises *Personal Training · Fri, Oct 2 · 10:00*, and they tap **Continue**.

![Time slot picker](screenshots/customer/11-pick-time.png)

### B12. Confirm booking

The confirmation screen (`/booking/confirm`) shows:

- the trainer, service, date and time (Friday, October 2 · 10:00 · 60 min) and city (Milano)
- **Note for the trainer (optional)**, up to 500 characters
- **Promotional code** and **Use my points** (100 points = €1.00)
- **Price summary**: Service €50.00, Total €50.00
- **Pay your trainer**: nothing is paid in the app; the customer pays €50 directly, and earns +50 XP once the trainer records the payment after the session
- the **Terms of service** and **Cancellation policy** checkbox (*free cancellation within 24 hours*), which is required

The customer writes a note, ticks the checkbox and taps **Confirm**.

![Confirm booking](screenshots/customer/12-confirm-booking.png)

### B13. Request sent

The app opens the booking detail with a green banner: *"Request sent, waiting for the trainer. We'll let you know as soon as the trainer replies."*

![Request sent banner](screenshots/customer/13a-booking-sent-banner.png)

The booking detail shows:

- status **Awaiting confirmation**
- the trainer's name and service, with a chat button to message the trainer
- a **check-in QR ticket** to show at reception
- date and time, with **Add to calendar**
- the note left for the trainer
- payment status **PENDING**, total €50.00, **Download receipt**
- the booking ID and **Cancel booking**

![Booking detail, awaiting confirmation](screenshots/customer/13-booking-requested.png)

*The provider now accepts the request (steps [A13–A15](#a13-new-booking-request-notification)).*

### B14. Booking accepted notification

Once the trainer confirms, the customer gets *"Booking accepted — Your trainer accepted your request for Personal Training."*

![Booking accepted notification](screenshots/customer/14-notification-confirmed.png)

### B15. My bookings

**My bookings** (`/bookings`) has the tabs Upcoming, Past and Cancelled, plus a refresh button and **+ New**. Under *Upcoming* it lists the session as **VFIT · CONFIRMED · Personal Training · Davide Moretti · Oct 2, 10:00 AM**.

![My bookings](screenshots/customer/15-my-bookings-confirmed.png)

### B16. Booking detail: confirmed

The booking detail now shows status **Confirmed**. The QR check-in ticket, calendar export and receipt are still available, and the actions are now **Reschedule** and **Cancel booking**.

![Booking detail, confirmed](screenshots/customer/16-booking-detail-confirmed.png)

**The journey is complete:** both accounts were created and the appointment is booked and confirmed on both sides.

---

## What changed since the first recording

The first recording (earlier on 30 Sep 2026, light theme) found nine issues; issues 1–7 and 9 were fixed the same day (commit `fa4ec61`). This recording confirms the fixes that show up in the flow:

- **Search by name** finds a brand-new provider without a location (typing "Davide Moretti" with Near me off lists him).
- **Provider bookings on a phone** are cards with Confirm / Decline / Complete always visible, so A14–A16 are now shown at phone width instead of desktop width.
- **Confirm feedback**: the button shows a spinner, the card switches to *Confirmed* straight away and a toast confirms it.
- **Trainer name** appears on the customer's booking card and booking detail (initials avatar instead of "?").
- **Email banner** sits above the *Provider portal* bar instead of under it.
- **Selected time slot** uses dark text on the section colour.

Screens that differ from the first recording: the provider's booking screens (A14–A16) are the mobile card layout; *My bookings* has three tabs (Upcoming, Past, Cancelled) plus **+ New** instead of a *New* tab; the confirmed booking detail adds **Reschedule**; the booking detail has a chat button next to the trainer.

## Issues observed during this walkthrough

None of these stopped the booking from going through.

| # | Severity | Where | What happened |
|--|--------|-----------|-------------------------------------|
| 1 | Medium | Booking calendar (B10) | Every future day is enabled, including weekends and days that the 24 h notice rules out. Picking one shows *"No times available"*. Days without free slots should be disabled. |
| 2 | Medium | Signup form, terms row (A4, B4) | The checkbox wrapper takes the full width, so the *I accept the Terms…* text is pushed to the right half of the box. When ticked, the box loses its fill and only a bare check mark shows. |
| 3 | Low | Provider bookings, Italian (A14) | The price is shown as `€50.00` (English format) instead of `50,00 €`. |
| 4 | Low | Signup screens, Italian | The **Indietro** / **Torna al login** back link runs under the language picker at 390 px. |
| 5 | Low | Booking detail (B13) | The *AWAITING CONFIRMATION* badge sticks out past the right edge of the status card. |
| 6 | Low | Provider bookings (A14) | The client avatar is squashed into a narrow oval. |
| 7 | Low | Book a service (B7, B8) | The *VERIFIED* badge is clipped at the card edge for long names. On results with a distance, "0.1 km" wraps between the price and *Check availability*. |
| 8 | Low | Edit Service dialog (A9) | The dialog is not centred on a phone (16 px left margin, about 48 px right). Its field labels are not linked to their inputs, and it has no `role="dialog"`. |
| 9 | Low | Provider dashboard (A6, A16) | A brand-new provider is greeted with *"Welcome back!"*. *Recent Activity* stays empty after a booking request and a confirmation. |
| 10 | Low | My bookings (B15) | The card's › chevron sits under the avatar, at the bottom-left of the card. |
| 11 | Low | Italian copy | The notification tag stays *BOOKING* and its description says "per booking"; the same action is *Controlla disponibilità* in results but *Verifica disponibilità* on the trainer page; the cancelled status is *Cancellate* in the provider portal but *Annullate* for the customer. |
| 12 | Info | Provider pages | The provider layout nests two `<main>` landmarks. |
| 13 | Info | Staging | No verification email arrives on staging (email secrets are placeholders by design), so the *Confirm your email* banner stays up. It does not block signup, service setup or booking. |
| 14 | Info | Location map (A12) | The Google map stays in its light style in dark theme. |

---

## Reproducing this walkthrough

1. Staging only lets in allowlisted emails. A superadmin adds them first at **Admin → Staging access** (`/admin/staging-access`), or they are written to `stagingAllowlist/{email}` with the Admin SDK.
2. Run the app locally against staging with `npm run dev` (`.env.local` points at `vfit-app-staging`). The staging gate is skipped on `localhost`, but sign-up is still checked against the allowlist on the server.
3. Set dark theme with the theme switch (or `localStorage['vfit.theme'] = 'dark'`) and English with the language picker (`localStorage['vfit.locale'] = 'en'`).
4. Follow Part A, then Part B, then A13–A16 and B14–B16.
5. Regenerate the Word file (pandoc + Pillow; screenshots are sized like the first recording, 844 px = 14.1 cm, capped at 20 cm):

   ```bash
   cd docs/user-journeys
   python3 build-docx.py signup-to-booking.md signup-to-booking.docx \
     "VFit — Signup-to-Booking User Journeys" \
     "Provider and customer, from account creation to a confirmed appointment" en-US
   ```
