# Group courses and activities

Course services are for shared lessons: one booking takes one place in a dated lesson. A full-course booking takes one place in every lesson, in one transaction. One flow serves everyone who runs classes:

- **Individual providers** (trainers, martial arts instructors, anyone without premises): their courses are not linked to a venue and work as they always did.
- **Venues** (gym, school and studio venues, including the venue a company gets when an admin approves it): the owner and the venue's active staff run the venue's courses with rooms, instructors, partner discounts and a public weekly timetable.

Terms: a **course** is the template (name, schedule, prices, capacity, policies); a **lesson** is one dated occurrence of it (one lesson per day, id `YYYY-MM-DD`); a **venue** has **locations** (an address and a timezone) and **rooms** in them. Behaviour reference: [features](../features.md#group-courses-and-activities), [API](../api/reference.md#group-course-api), [data model](../database-schema.md#group-course-collections). The old separate partner-gym timetable is superseded by this flow ([note](partner-gym-timetable.md)).

## Venue set-up (owner, staff and admin)

1. An admin makes the venue a **partner**: in Admin → Venues, set the status to **Active** and, if wanted, the **member discount** and the **partner instructor extra** percentages (0-100). A company venue starts as pending, so a company cannot publish a course or open its timetable to customers until an admin activates it. Drafts can always be saved.
2. The owner (or staff, or an admin) opens **Manage courses** → the venue's page (`/provider/courses?venue=<id>`) and adds **locations** (name, address, city, IANA timezone, default Europe/Rome) and **rooms** in the **Locations and rooms** panel; a location or room can be deactivated and reactivated. The same panel is on the venue's admin page.
3. An admin links **instructors** to the venue (Admin → Venues → the venue) and sets each one's partner status (pending / active / suspended). Only linked, active instructors can be picked for a venue course; an instructor whose status is **active** also earns customers the venue's partner instructor extra.
4. **Staff** are accounts with a `venueStaff/{uid}` record (`venueId`, `isActive`) written by an admin; there is no screen for it yet, so an admin adds or deactivates staff directly in the database. Staff see only **Manage courses** in the provider menu and work on the venue's page; the venue owner stays the provider of record of the courses they create.

## Provider: create and publish

1. Sign in as an approved provider or as venue staff. Open **Services → Create course**, or **Manage courses** in the provider menu (`/provider/courses`; `?venue=<id>` for a venue, with a selector when you manage several). **Create course** opens `/provider/courses/create`; **Edit course** opens `/provider/courses/edit?id=…`. Both are dedicated pages, so clicking outside the form cannot discard it. Unsaved values are retained in the browser tab, separately for each provider/course, until saving succeeds.
2. Enter the course name, category, description and level/equipment instructions. Type in the category combobox to filter translated names, sorted alphabetically for the current language; select a result with a click or the arrow keys and Enter.
3. **Venue (optional).** The venue selector lists the venues you manage (owner or staff) that host courses; **No venue (independent course)** keeps the course yours alone.
   - *Without a venue*: type the address/city and the instructor name (you may link your own instructor profile); choose the timezone (default Europe/Rome).
   - *With a venue*: choose the **location**, the **room** and the **instructor of the venue** from the venue's lists (a single active location or room is picked for you). The timezone is the location's and read-only; place text and the instructor's name are filled in by the server. If the venue has no locations yet, the editor links to the panel that adds them.
4. Set maximum participants and lesson duration. Choose the first local date/time.
5. Select one lesson, daily recurrence or weekly recurrence. Repeating courses require an end date; weekly schedules specify weekdays. The interval sets every N days/weeks. Annual courses support multiple lessons each week and daily lessons, including leap years. Schedules remain bounded to three years; a course that takes a room or an instructor can have at most 400 upcoming lessons.
6. Enter the price per lesson, the complete-course price, or both. A blank price disables that purchase option; **0 makes it free**. Prices are per participant, in EUR.
7. Set booking notice and cancellation deadline (defaults 2 hours and 24 hours), and whether customers can **join a waitlist when a lesson is full** (on by default). Keep **Draft** until ready.
8. Choose **Published**, press **Preview lessons**, and check every generated date and local time. For a venue course the preview also marks any lesson whose room or instructor is already taken: **Room: Conflicts with “X” (time)** (or **Instructor: …**). Fix the room, instructor or time and preview again. Press **Save course**; preview again after changing any field before publication. Invalid dates, timezone gaps and ambiguous times must be corrected; errors display translated guidance rather than raw validation JSON.
9. A published course appears in customer discovery (and, for a venue course, in the venue's timetable). A linked group service is maintained under the provider's existing service catalogue; edit it through Manage courses.

**Overlap protection.** While a course is published, each of its upcoming lessons holds its room and its instructor. Saving another course (or moving a lesson) into the same room or the same instructor at an overlapping time is refused with the name and time of the course in the way (back-to-back classes are fine). Unpublishing, archiving, cancelling or moving a lesson frees its slot.

**Once a course has bookings**, its schedule, prices, venue, room and instructor are protected; use the lesson actions below. Capacity can increase, but cannot fall below the confirmed plus held seats of an upcoming lesson.

## Customer: find a lesson

- **Weekly timetable.** On a venue's page (`/venue?id=…`) the **Next lessons** list shows the next three lessons and **Full timetable** opens `/fit/gyms/timetable?id=<venue>`: a week at a time (day tabs on a phone, seven columns on desktop), filtered by location, room or instructor. Each card shows time, room, instructor, **seats left** (or **Waitlist open** / **Full**) and the price. A visitor sees the regular price; a signed-in customer sees their own price, with the regular price struck through and `−X%` when the venue and instructor earn a discount. If the venue is not an active partner, the timetable says so instead.
- **Course list.** Open **Courses and group activities** from booking discovery or the side menu (`/courses`). Filter by category, city/location, earliest date and maximum price. Load further pages when needed. A card from the timetable opens the course with that lesson ready to book.

## Customer: reserve one lesson

1. Open a course's **Lessons**. Check instructor, venue, level, equipment, cancellation policy and remaining places for each lesson. Held checkout seats count against availability.
2. Choose **Book lesson**. The **review** shows the lesson, the **regular price**, the partner benefit lines (for example "Partner venue benefit (10%)" and "Partner instructor benefit (5%)"), **Total savings** and **Your price**, and the payment method. A free lesson shows **Free** and offers no payment choice.
3. **Confirm booking.** The server prices the booking again. If the price or the lesson changed while you were reviewing (a new price, another capacity or time, or a different instructor), nothing is booked: the review shows the new numbers with a notice ("The price has changed…" or "The lesson was updated…") and you confirm again.
4. With direct payment, the place is confirmed immediately. Pay the provider separately; the app initially shows Payment pending. A free booking is confirmed and shows as paid.
5. Open **My course bookings** (`/courses?tab=bookings`, also linked from My bookings). The lesson dates and reservation/payment status are visible.

## Customer: enroll in the whole course

Choose **Full course** instead. Review all lesson dates and the complete-course price (with the same savings lines). Enrollment is available before the actual first lesson starts. All lessons must have places; if another customer takes the last place in any lesson, the request fails without reserving a partial course (and a series cannot be waitlisted). Existing enrollment in any included lesson prevents duplicate series enrollment.

One customer books one place per lesson. Household/group purchases and mid-series prorating are not included. After the first lesson starts, single lessons remain bookable when the provider offers them.

## Customer: the waitlist

1. When a lesson is full, the course allows it and the booking-notice window is still open, the lesson shows **Join waitlist** (a booking attempt on a full lesson also offers it). Choose it; you see **On the waitlist · position N** and can **Leave waitlist** at any time. Up to 100 customers can wait per lesson (**Waitlist full** after that).
2. When a seat frees up (someone cancels, staff remove a participant, an unpaid online hold expires, a late payment is refunded, or capacity grows), the first waiting customer is booked automatically, in order. With direct payment the booking is **confirmed** and you get a "Spot opened up" notification; with online payment the seat is **held for 30 minutes** ("Pay within N minutes to keep your spot" next to the Pay button in My course bookings) and the next customer is tried if it lapses.
3. An entry that can never be promoted (inactive account, online payment unavailable or too small, your own course) is removed and you are told why. When the lesson is cancelled, rescheduled, the course is archived or the lesson gets too close to start, the whole list is closed and everyone is notified.
4. **My course bookings → Waitlist** lists your entries (course, date, position, **Leave**); entries of lessons that already started are hidden.

## Provider: roster, attendance and direct payment

1. Open Manage courses → **Participants** → choose a lesson. The provider (or venue staff) sees private participant names, their enrollment/payment status and the lesson's **waitlist** (position, name, **Remove from waitlist**). Public course pages show counts only.
2. When a customer pays, choose **Record payment**, select cash, bank transfer, Satispay or other, and confirm. This records the amount for the active booked lessons (the discounted amount). Advance payment for the entire course is supported; recording payment is separate from attendance.
3. After a lesson starts, mark each confirmed participant Present or Absent. Future lessons cannot be marked attended. **Absent is a no-show**: the participant is flagged, and from the second no-show the roster also shows the customer's running count in that course.
4. To stop taking reservations, edit the course and select Enrollment closed.

## Provider: lesson actions

For an upcoming lesson, Manage courses → **Participants** → the lesson offers:

- **Reschedule lesson** (reason and a new local time; for a venue course also the room). The new slot is checked against the other courses' rooms and instructors, the lesson's waitlist is closed, and every participant is notified.
- **Cancel lesson** (reason): participants are released with refund obligations and told; its slots are freed; the waitlist is closed. Cancelling the last remaining lesson archives the course.
- **Substitute instructor** (venue courses: pick another instructor linked to the venue; reason optional). The instructor's day is checked for a clash, and every participant is notified. Existing bookings keep the price they paid; new customers see the substitute's discount.
- **Change capacity**: raise or lower one lesson's places (not below the booked and held seats). Raising it seats waiting customers.
- **Remove participant**: frees the seat, refunds as for a provider cancellation, notifies the customer and offers the seat to the waitlist. If the customer's own cancellation deadline has passed, the page warns that the removal is recorded as a **late cancellation** (no fee); late cancellations are listed under the lesson.
- **Cancel remaining lessons** (reason): archives the course and cancels every upcoming lesson.

Customers receive notifications for each change. Cancelled lessons cannot accept reservations. Attendance/payment history remains available; courses with bookings are archived rather than deleted.

## Cancellations and refunds

Customers cancel individual future lessons in My course bookings before the snapshotted cancellation deadline. Seats are released once; replaying a request does not release extra seats. Cancelling an unpaid Stripe hold abandons the entire held purchase.

If the provider recorded direct payment, eligible cancellations create **Refund due** entries. The provider returns the money outside VFit, then presses **Confirm refund paid**. A complete-course price is allocated across lessons in integer cents and each lesson's share takes its own discount; the stored per-lesson amounts sum to the paid total, and refunds use them. Free bookings create no refund.

## Optional online checkout

Direct payments remain the default. A superadmin can enable Stripe globally and **Online course checkout** in Admin → Settings. Both settings must be enabled. Missing/loading/disabled settings hide the customer's online-payment option, and server callables reject attempts to bypass this. A discounted price below 50 cents cannot be charged online: such a booking is paid directly.

When available, customers can choose Pay online at review. Stripe-hosted Checkout opens; on mobile its return uses the deployed web application. The browser return refreshes bookings; only a verified Stripe webhook confirms payment and converts held seats to confirmed seats. Initial enrollment holds last 30 minutes; starting Checkout aligns the hold with an immutable 31-minute expiry, allowing one minute of provisioning slack beyond Stripe's minimum. Abandoned/expired holds are released by maintenance (and the seat goes to the waitlist). A payment received after expiry or cancellation is refunded rather than overbooking.

Online cancellations create idempotent Stripe refunds. Processing refunds are reconciled using their Stripe IDs; failed refunds remain recorded for operational investigation. Refunds reduce the platform's recorded amount owed to the provider. Stripe funds are collected by the platform; automatic provider transfers are outside this release.

**VFit escrow is future work.** It is not displayed or accepted as a booking payment option. Ordinary Stripe checkout does not promise escrow, delayed settlement or buyer protection. Activating an escrow option requires its own provider onboarding, payout/release and dispute flow.

## Notifications

Course confirmations, payment confirmations, lesson changes/cancellations, upcoming lesson reminders and the unified-flow events use the existing in-app/push/email infrastructure and the customer's language (Italian, English, Spanish, French, German): spot opened up (confirmed, or held for 30 minutes), waitlist closed, removed from the waitlist, instructor changed, lesson rescheduled, cancelled by the provider. Duplicate events do not create duplicate inbox entries; a promoted customer gets one notice, not two. Cancelled lessons skip reminders. Provider-side notices of a venue course open the venue's course page. Roster access is restricted to the customer, the course's provider, the venue's owner and active staff, and authorized admins.

## Staging verification

The staging URL is https://vfit-app-staging.web.app. See [staging deployment](../deployment/staging.md) for the latest deployed verification record, the **Unified courses hosting deploy** checklist and Stripe prerequisites. The journey can be exercised with the demo provider/customer accounts and the fixture venue that `scripts/smoke-unified-courses-staging.mjs --keep` leaves behind. Keep course checkout off until valid Stripe test secrets and the signed course webhook endpoint are configured.

## Provider adds participants

1. Open Manage courses → Participants and choose a future lesson. **Add participant** searches only clients linked to the course's provider (for a venue course, the venue owner's clients); type a name or email and select the person. Venue staff can do this for the venue's courses.
2. Choose one lesson or the whole course. Confirming reserves the selected seats with the usual capacity, duplicate and advance-notice checks, and the usual venue discount; there is no price confirmation step for staff. Payment remains directly with the provider; adding someone does not charge them.
3. If the person is missing, choose **New participant**. Full name and email are required; a separate surname and phone are optional. An existing account with that email is reused and linked. A new email gets a pending account and provider relationship before enrollment. If the class is full, the relationship remains and retry reuses that identity.
4. After adding, or from the participant row, optionally choose **Notify by email** or **Notify by phone**. Email delivery shows success or failure. Phone prepares SMS/WhatsApp links; the provider opens the composer and sends from their own device. This does not claim automatic SMS delivery.
5. New participants receive a private password setup link by email. Phone messages link to `/auth/participant`, which sends setup to the participant’s own email. Providers never receive password setup credentials. The participant sets their password and signs in using the existing email; their reservations and every provider relationship remain on the same account.

A provider can have many participants, and a participant can have many providers. Customer course bookings also create a missing relationship automatically. One provider cannot access or modify another provider’s roster. Adding a relationship does not transfer a customer or remove their other providers.

## Find courses in general activity search

Customers can also use Search → enter a course name or activity → submit. The general booking results include matching published courses alongside providers. Course cards show the provider, location, next-lesson places, lesson/full-course prices and a **Lessons** link that opens the course booking screen. Text matching ignores case and accents; category chips match the course leaf or parent, and price filtering uses the lesson price when offered, otherwise the whole-course price. A full next lesson does not hide the course because later lessons may remain bookable. Load more courses to search subsequent pages.
