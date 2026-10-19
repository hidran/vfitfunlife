# Group courses and activities

Course services are for shared lessons: one booking takes one place in a dated lesson. A full-course booking takes one place in every lesson, in one transaction. Trainers, martial arts instructors and gym providers use the same flow.

## Provider: create and publish

1. Sign in as an approved provider. Open **Services → Create course**, or **Manage courses** in the provider menu (`/provider/courses`). **Create course** opens `/provider/courses/create`; **Edit course** opens `/provider/courses/edit?id=…`. Both are dedicated pages, so clicking outside the form cannot discard it. Unsaved values are retained in the browser tab, separately for each provider/course, until saving succeeds.
2. Enter the course name, category, description, instructor and address/city. Add level and equipment instructions where useful. Type in the category combobox to filter translated names, sorted alphabetically for the current language; select a result with a click or the arrow keys and Enter.
3. Set maximum participants and lesson duration. Choose the first local date/time and timezone (default Europe/Rome).
4. Select one lesson, daily recurrence or weekly recurrence. Repeating courses require an end date; weekly schedules specify weekdays. The interval sets every N days/weeks. Annual courses support multiple lessons each week and daily lessons, including leap years. The 100-lesson cap has been removed. Schedules remain bounded to three years to prevent accidentally unbounded recurrence.
5. Enter the price per lesson, the complete-course price, or both. A blank price disables that purchase option. Prices are per participant, in EUR.
6. Set booking notice and cancellation deadline (defaults 2 hours and 24 hours). Keep **Draft** until ready.
7. Choose **Published**, press **Preview lessons**, and check every generated date and local time. Press **Save course**. Preview again after changing any field before publication. Required inputs are validated before preview. Invalid dates, timezone gaps and ambiguous times must be corrected; errors display translated guidance rather than raw validation JSON.
8. The course appears in customer discovery. A linked group service is maintained under the provider's existing service catalogue; edit it through Manage courses.

## Customer: reserve one lesson

1. Open **Courses and group activities** from booking discovery or the side menu (`/courses`). Filter by category, city/location, earliest date and maximum price. Load further pages when needed.
2. Open a course's **Lessons**. Check instructor, venue, level, equipment, cancellation policy and remaining places for each lesson. Held checkout seats count against availability.
3. Choose **Book lesson** next to an available date. Review the date, total and payment method, then **Confirm booking**.
4. With direct payment, the place is confirmed immediately. Pay the provider separately; the app initially shows Payment pending.
5. Open **My course bookings** (`/courses?tab=bookings`, also linked from My bookings). The lesson dates and reservation/payment status are visible.

## Customer: enroll in the whole course

Choose **Full course** instead. Review all lesson dates and the complete-course price. Enrollment is available before the actual first lesson starts. All lessons must have places; if another customer takes the last place in any lesson, the request fails without reserving a partial course. Existing enrollment in any included lesson prevents duplicate series enrollment.

One customer books one place per lesson. Household/group purchases and mid-series prorating are not included. After the first lesson starts, single lessons remain bookable when the provider offers them.

## Provider: roster, attendance and direct payment

1. Open Manage courses → **Participants** → choose a lesson. The provider sees private participant names and their enrollment/payment status. Public course pages show counts only.
2. When a customer pays, choose **Record payment**, select cash, bank transfer, Satispay or other, and confirm. This records the amount for the active booked lessons. Advance payment for the entire course is supported; recording payment is separate from attendance.
3. After a lesson starts, mark each confirmed participant Present or Absent. Future lessons cannot be marked attended.
4. To stop taking reservations, edit the course and select Enrollment closed. Capacity can increase, but cannot fall below confirmed plus held seats. Once a course has enrollment history, its schedule/prices are protected; use the explicit reschedule action for individual lessons.

## Cancellations and changes

Customers cancel individual future lessons in My course bookings before the snapshotted cancellation deadline. Seats are released once; replaying a request does not release extra seats. Cancelling an unpaid Stripe hold abandons the entire held purchase.

Providers can **Reschedule lesson** with a reason and a new local time, **Cancel lesson**, or **Cancel remaining lessons** with a reason. Customers receive notifications. Cancelled lessons cannot accept reservations. Cancelling every remaining lesson archives the course immediately so it leaves discovery. Attendance/payment history remains available; courses with bookings are archived rather than deleted.

If the provider recorded direct payment, eligible cancellations create **Refund due** entries. The provider returns the money outside VFit, then presses **Confirm refund paid**. A complete-course price is allocated across lessons in integer cents; rounding is deterministic and the allocations sum to the paid total.

## Optional online checkout

Direct payments remain the default. A superadmin can enable Stripe globally and **Online course checkout** in Admin → Settings. Both settings must be enabled. Missing/loading/disabled settings hide the customer's online-payment option, and server callables reject attempts to bypass this.

When available, customers can choose Pay online at review. Stripe-hosted Checkout opens; on mobile its return uses the deployed web application. The browser return refreshes bookings; only a verified Stripe webhook confirms payment and converts held seats to confirmed seats. Initial enrollment holds last 30 minutes; starting Checkout aligns the hold with an immutable 31-minute expiry, allowing one minute of provisioning slack beyond Stripe's minimum. Abandoned/expired holds are released by maintenance. A payment received after expiry or cancellation is refunded rather than overbooking.

Online cancellations create idempotent Stripe refunds. Processing refunds are reconciled using their Stripe IDs; failed refunds remain recorded for operational investigation. Refunds reduce the platform's recorded amount owed to the provider. Stripe funds are collected by the platform; automatic provider transfers are outside this release.

**VFit escrow is future work.** It is not displayed or accepted as a booking payment option. Ordinary Stripe checkout does not promise escrow, delayed settlement or buyer protection. Activating an escrow option requires its own provider onboarding, payout/release and dispute flow.

## Notifications

Course confirmations, payment confirmations, lesson changes/cancellations and upcoming lesson reminders use the existing in-app/push/email infrastructure and customer language. Duplicate events do not create duplicate inbox entries. Cancelled lessons skip reminders. Roster access is restricted to the customer, course owner and authorized admins.

## Staging verification

The staging URL is https://vfit-app-staging.web.app. See [staging deployment](../deployment/staging.md) for the latest deployed verification record and Stripe prerequisites. This journey can be exercised with the existing demo provider/customer accounts. Keep course checkout off until valid Stripe test secrets and the signed course webhook endpoint are configured.

## Provider adds participants

1. Open Manage courses → Participants and choose a future lesson. **Add participant** searches only clients linked to this provider; type a name or email and select the person.
2. Choose one lesson or the whole course. Confirming reserves the selected seats with the usual capacity, duplicate and advance-notice checks. Payment remains directly with the provider; adding someone does not charge them.
3. If the person is missing, choose **New participant**. Full name and email are required; a separate surname and phone are optional. An existing account with that email is reused and linked. A new email gets a pending account and provider relationship before enrollment. If the class is full, the relationship remains and retry reuses that identity.
4. After adding, or from the participant row, optionally choose **Notify by email** or **Notify by phone**. Email delivery shows success or failure. Phone prepares SMS/WhatsApp links; the provider opens the composer and sends from their own device. This does not claim automatic SMS delivery.
5. New participants receive a private password setup link by email. Phone messages link to `/auth/participant`, which sends setup to the participant’s own email. Providers never receive password setup credentials. The participant sets their password and signs in using the existing email; their reservations and every provider relationship remain on the same account.

A provider can have many participants, and a participant can have many providers. Customer course bookings also create a missing relationship automatically. One provider cannot access or modify another provider’s roster. Adding a relationship does not transfer a customer or remove their other providers.

## Find courses in general activity search

Customers can also use Search → enter a course name or activity → submit. The general booking results include matching published courses alongside providers. Course cards show the provider, location, next-lesson places, lesson/full-course prices and a **Lessons** link that opens the course booking screen. Text matching ignores case and accents; category chips match the course leaf or parent, and price filtering uses the lesson price when offered, otherwise the whole-course price. A full next lesson does not hide the course because later lessons may remain bookable. Load more courses to search subsequent pages.
