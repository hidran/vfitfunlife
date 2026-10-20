# Group courses and activities

Course services are for shared lessons: one booking takes one place in a dated lesson, and a full-course booking takes one place in every lesson, in one transaction. One flow serves everyone who runs classes:

- **Individual providers** (trainers, martial arts instructors, anyone without premises): their courses are not linked to a venue and work as they always did. See [Part B](#part-b-individual-provider).
- **Venues** (gym, school and studio venues, including the venue a company gets when an admin approves it): the owner and the venue's active staff run the venue's courses with rooms, instructors, partner discounts and a weekly timetable. See [Part C](#part-c-venue-linked-courses) and the actor journeys [company owner](company-owner-venue.md), [venue staff](venue-staff.md) and [admin](admin-business-and-venues.md).
- **Customers** book, wait for a seat and cancel the same way whichever kind of course it is. See [Part A](#part-a-customer). Italian summary of Part A: [group-courses.it.md](group-courses.it.md).

Terms: a **course** is the template (name, schedule, prices, capacity, policies); a **lesson** is one dated occurrence of it (one lesson per calendar day, id `YYYY-MM-DD`, so a course cannot hold two lessons on the same day); a **venue** has **locations** (an address and a timezone) and **rooms** in them. Behaviour reference: [features](../features.md#group-courses-and-activities), [API](../api/reference.md#group-course-api), [data model](../database-schema.md#group-course-collections), [authority matrix](../backend/roles-and-permissions.md#group-course-authority). The old separate partner-gym timetable is superseded by this flow ([note](partner-gym-timetable.md)). All journeys: [index](README.md).

**Screenshots.** This guide has none yet: no group-course screen has been captured (only the signup-to-booking and business screens exist, see the [index](README.md#screenshots-status)). Labels below are the English UI texts from `src/i18n/messages/en.ts`.

**Signed-in only.** Every customer screen of this guide (`/courses`, `/venue`, `/fit/gyms`, `/fit/gyms/timetable`) sits under the `(main)` layout, which sends a signed-out visitor to `/auth/login` (the redirect does not carry a return address). The components do handle a signed-out viewer (regular price, "sign in first, then come back to this lesson" through `?next=`), but that path cannot be reached in the shipped app by code reading (`src/app/(main)/layout.tsx`); it was not re-checked in a browser. Firestore itself allows the public reads, so the data is not secret, only the pages are behind sign-in.

---

## Part A: Customer

### A1. Find a lesson

**Goal.** Reach the lesson or course you want to book.

**Preconditions.** A signed-in customer account. The course is **Published**, its provider is verified, and (for a venue course) the venue is an active partner for the timetable to show it.

**Steps.**

1. **Venue page → Next lessons.** Open a gym, school or studio from **Gyms & schools** (`/fit/gyms`, Italian *Palestre e scuole*; list or map, search by name or city, **Near me** with a radius). The venue page (`/venue?id=…`) has a **Gym timetable** button and, for an active partner venue, a **Next lessons** list of the next three lessons. Choosing a lesson opens `/courses?id=<course>&lesson=<day>`: the course sheet opens and the review of that lesson starts by itself (a full lesson opens with the waitlist offer, see A5). **Full timetable** opens step 2.
2. **Weekly timetable** (`/fit/gyms/timetable?id=<venue>`). One week at a time (day tabs on a phone, seven columns from 1024 px), with filters **All locations**, **All rooms**, **All instructors** and previous/next week. Each card shows the course, start and end time in the venue's timezone, room, instructor, **Seats left: N** (or **Waitlist open** / **Full**) and the price. A lesson that already started is shown but is not a link. If the venue is not an active partner (or is switched off) the page says "The timetable is not available: this venue is not an active partner right now." Owners, staff and admins also see a **Manage courses** button.
3. **Course list.** **Courses and group activities** (`/courses`, also in the side menu and linked from booking discovery): filters category, city/location text, **From date**, **Maximum price**; 50 courses per page, **Load more courses**. Only courses whose next lesson is still in the future are shown. Each card shows provider, place, next lesson (in the course's timezone), places left and the lesson/full-course prices; **Lessons** opens the course sheet.
4. **General search.** Search → a course name or activity: matching published courses appear next to providers, with a **Lessons** link to the course sheet. Matching ignores case and accents; category chips match the course category or its parent; the price filter uses the lesson price when offered, otherwise the course price. A full next lesson does not hide the course because later lessons may be open. See [Find courses in general activity search](#find-courses-in-general-activity-search).

**Prices on the screens.** Your price is the course price minus the venue's member discount and, when the lesson's instructor is an active partner instructor, the partner instructor extra (capped at 100%). There is no membership check: every signed-in customer gets the discount. The timetable and the lesson list show your price with the regular price struck through and `−X%` when you save; independent courses never show a discount. The timetable asks the server for prices for at most 8 courses at a time (the day on screen on a phone, the filtered week on a desktop), and the server allows 60 price requests per user per 10 minutes; lessons beyond that keep the regular price.

**Errors.** The list or timetable failing to load shows "Courses could not load. Try again." with **Retry** on the list. No result shows "No courses found. Try other filters." or "No lessons scheduled."

### A2. Reserve one lesson

**Goal.** Take one place in one lesson.

**Preconditions.** A lesson that is scheduled, has a free seat, starts further away than the course's booking notice (default 2 hours), on a published course with enrollment open; you have no booking in it yet; it is not your own course. A venue course also needs the venue to be an active partner.

**Steps.**

1. **Course sheet → Lessons.** Each lesson shows date and time, place and instructor, **Available spots: free / capacity** (held checkout seats count as taken), and your own state if you already have it (**Confirmed** or **Spot held for payment**). The cancellation rule is printed above the list ("Cancel up to N hours before the lesson.").
2. **Book lesson · price.** The button asks the server for a fresh quote of exactly that lesson and opens **Review booking**: the lesson, the regular price, the benefit lines ("Partner venue benefit (10%)", "Partner instructor benefit (5%)" when they apply), **Total savings**, **Your price**, the cancellation rule and the payment method ("Pay the provider directly", or "Pay online" when you chose it). A free lesson shows **Free** and no payment choice.
3. **Confirm booking.** The server prices the booking again. It is made only if the amount and the lesson's revision are exactly what you reviewed.
4. **Result.** The sheet closes, a green "Booking confirmed" appears and **My course bookings** opens (A6). With direct payment the place is confirmed at once and shows **Payment pending** until the provider records the payment; a free booking is confirmed and shows **Paid**. Online payment is covered in A7.

**Errors (shown in red in the review, or under the lesson list).** The button is simply disabled, with no message, when the lesson is full without a waitlist, inside the notice window, cancelled, already booked by you, or the course is closed or unpublished.

| Situation | What you see |
|---|---|
| Someone took the last seat while you looked (`lesson_full`) | "This lesson is full." and, if the waitlist is allowed, a **Join waitlist** button; **Confirm booking** is disabled |
| The price changed while reviewing (`price_changed`, reason price) | Nothing is booked. A notice "The price has changed. Check the new total and confirm again." and the review shows the new numbers; confirm again |
| The lesson changed (capacity, time, room or instructor; reason availability) | Same, with "The lesson was updated (for example its capacity or schedule). Check the details and confirm again." |
| The lesson is now inside the notice window (`booking_deadline`) | "The booking deadline for this lesson has passed." |
| Course closed or unpublished (`enrollment_closed`) | "Enrollment for this course is closed." |
| You already have this lesson (`already_enrolled`) | "There is already a booking for this lesson." |
| The venue was switched off or is not an active partner (`venue_not_active`) | "This venue is not active right now." |
| Your own course (`cannot_book_yourself`) | "You cannot book your own course." |
| Account suspended (`account_inactive`) / provider no longer verified (`provider_unavailable`) | "The account is not active." / "The provider is not available right now." |
| Online payment chosen but off (`online_payments_disabled`) or total under €0.50 (`checkout_amount_too_low`) | "Online course payments are not enabled. Choose direct payment instead." / "Online payment needs at least €0.50. Choose direct payment instead." |
| More than 60 price requests in 10 minutes (`rate_limited`) | "Too many requests. Wait a few minutes and try again." |
| Reload needed (`expected_price_required`), repeated request (`request_id_reused`) | "Reload the page to see the current price before booking." / "This request was already used. Start again." |
| Any code the app does not know | "Action failed. Check the details and try again." |

**Edge cases.**

- *Lesson inside the notice window:* the booking button is disabled, the waitlist is not offered, and a lesson that becomes too close closes its whole waitlist (A5).
- *Price changed after a waitlist promotion:* a promoted customer is booked at the price at promotion time, with no review step (A5).
- *Venue suspended:* see the [venue suspended](#when-the-venue-is-suspended-or-the-company-is-converted) notes below.

### A3. Enroll in the whole course

**Goal.** One place in every lesson of a course, in one transaction.

**Preconditions.** The course offers a full-course price, its first lesson has not started, every lesson is scheduled, has a free seat and is outside the notice window.

**Steps.** Course sheet → the **Full course · price** button (hint "One spot in every lesson. Enroll before the course starts.") → **Review booking** lists every lesson date, the course price with the same savings lines → **Confirm booking**. The complete-course price is split across the lessons in whole cents and each lesson's share takes its own discount; the stored per-lesson amounts add up to the total and refunds use them.

**Errors.** If any lesson is full, cancelled or inside the notice window the button is disabled without a message; if another customer takes the last place of any lesson during the confirmation, "This lesson is full." and nothing is reserved (no partial course, and a series cannot be waitlisted). After the first lesson starts: "The course has already started: only single lessons can be booked." An existing booking in any included lesson blocks the series ("There is already a booking for this lesson."). `price_changed` behaves as in A2.

**Not included.** One place per lesson per customer; no household or group purchase; no mid-series prorating. After the first lesson starts, single lessons stay bookable.

### A4. See why a price differs

**Goal.** Understand and trust the number before paying.

1. In the timetable or the lesson list you see the regular price struck through and your price.
2. In the review the lines explain it: the venue benefit percentage, the partner instructor benefit percentage (only when the lesson's instructor is an **active** partner of the venue), **Total savings** and **Your price**.
3. If a substitute instructor is assigned to a lesson, the discount of the substitute applies to *new* bookings; existing bookings keep the price they were made at.
4. If a provider or admin changes a price, a discount percentage or a lesson between your review and your confirmation, you see the notice in A2 and must confirm the new numbers.

### A5. Join the waitlist and get promoted

**Goal.** Get a seat in a full lesson without checking again.

**Preconditions.** The lesson is full, the course allows a waitlist (on by default), the lesson is outside the booking notice, and it is a single lesson (a full course cannot be waitlisted). Fewer than 100 people are waiting.

**Steps.**

1. **Lesson list** → **Join waitlist** (also offered inside the review after "This lesson is full." and when you open a full lesson from the timetable). The lesson then shows **On the waitlist · position N** with **Leave waitlist**. At 100 waiting, the button reads **Waitlist full**.
2. A seat frees up (a cancellation, a staff removal, an unpaid online hold expiring, a late payment being refunded, or a capacity increase). The first waiting customer is booked automatically, in order.
   - Direct payment: the booking is **Confirmed** and you get the notification "A spot opened up".
   - Online payment: the seat is **held for 30 minutes**; the notification says "A spot opened up: pay within 30 minutes", and **My course bookings** shows "Pay within N minutes to keep your spot." (or "Pay within 1 minute…") next to **Continue to payment**. If the hold lapses, the next customer is tried.
3. **My course bookings → Waitlist** lists your entries (course, date, position, **Leave waitlist** → "Leave the waitlist?" → **Confirm booking**). Entries of lessons that already started are hidden.

**Errors.** "You are already on the waitlist for this lesson." (`already_waitlisted`), "This course has no waitlist." (`waitlist_disabled`), "The waitlist is full." (`waitlist_full`), "The waitlist is not available for this lesson." (`waitlist_not_open`: not full, course closed, or inside the notice window), plus the venue, account and online-payment messages of A2.

**Edge cases.**

- An entry that can never be promoted (inactive account, online payment unavailable or too small, your own course) is removed and you are told why ("Removed from the waitlist").
- When the lesson is cancelled, rescheduled, the course is archived or the lesson gets inside the notice window, the whole list is closed and everyone is told ("Waitlist closed").
- If the venue is switched off, promotion for that lesson stops and the entries are kept.
- A promoted customer is booked at the price at promotion time; the review step is skipped.

### A6. My course bookings and cancelling

**Goal.** See your bookings and cancel a lesson in time.

**Preconditions.** At least one booking. The tab is `/courses?tab=bookings` (**My course bookings**), also linked from **My bookings**.

**Steps.**

1. Each booking card shows the course name (a link back to the course), the state (**Confirmed**, **Spot held for payment**, **Cancelled**, **Expired**), the scope (**Single lesson** / **Full course**), the total, **Paid** or **Payment pending**, how you pay, any **Refunds** amount, and the lessons with their dates in the course's timezone.
2. A held online booking shows **Continue to payment**.
3. **Cancel booking** next to a lesson → "Cancel this booking?" → **Confirm booking** (the same label as when booking) → the seat is released once. Cancelling an unpaid online hold abandons the whole held purchase.
4. Below the bookings, the **Waitlist** section (A5).

**Rules.** The button exists only while the lesson starts more than the course's cancellation deadline (default 24 hours, snapshotted on your booking) ahead; a held (unpaid online) booking can be cancelled at any time. Past the deadline there is no button and no explanation; a request made anyway (an old page) shows "The free cancellation deadline has passed." (`cancellation_deadline`).

**Refunds.** If the provider had recorded a direct payment, the cancellation creates a **Refund due** for the provider, who returns the money outside VFit and confirms it; your card shows the refund amount. An online (Stripe) cancellation creates an automatic refund. Free bookings create no refund.

**Edge cases.**

- *Late cancellation by staff:* if staff remove you after your own deadline, the removal is recorded against you as a late cancellation (no fee, only a counter the provider sees) and you are told the booking was cancelled.
- *No-show:* a participant the provider marks **Absent** is flagged; the provider sees the running count per course. There is no fee.
- *Provider cancels a lesson:* you are released, told, and refunded as above; the lesson shows **Cancelled** in your booking.
- *Lesson rescheduled:* you are notified; your booking moves with the lesson.

### A7. Pay online (optional)

Direct payment is the default. When a superadmin has switched on both **Stripe payments** and **Online course checkout** (Admin → Settings), the review offers **Pay online**: **Confirm booking** creates a 30-minute hold and opens Stripe-hosted Checkout. Only a verified Stripe webhook confirms payment and turns the held seat into a confirmed one; the browser return only refreshes your bookings. Totals between €0.01 and €0.49 cannot be charged online and are paid directly. See [Optional online checkout](#optional-online-checkout).

### When the venue is suspended or the company is converted

- A venue that is not an active partner (pending, suspended) or is switched off shows the timetable notice above, hides **Next lessons** and refuses new bookings and waitlist entries with "This venue is not active right now."
- Its already published courses stay in the course list (they are not unpublished), and existing bookings are kept untouched.
- Rejecting a company, converting it to an individual or deleting its owner switches its own venue off; approving the company again switches it back on, unless an admin turned it off by hand.
- A rejected or suspended provider's courses leave the list and the timetable; a converted company stays a verified provider, so its courses stay listed but its venue courses cannot be booked.

### Known limitations (customer)

- Signed-out visitors cannot open any of these pages (see the note at the top).
- A series is not available (disabled, no explanation) when any single lesson is full, cancelled or inside the notice window, and a series cannot be waitlisted.
- Past the cancellation deadline the **Cancel booking** button disappears without a message.
- The cancel confirmation button is labelled **Confirm booking**.
- My course bookings lists your newest 500 bookings; the course list loads 50 at a time.
- A lesson holds at most 100 waiting customers; a promoted customer is not shown a price review.
- The Stripe path is off by default, and staging runs without valid Stripe test secrets until [staging deployment](../deployment/staging.md) says otherwise (deployment state, not checkable in code).

---

## Part B: Individual provider

### B1. Become a provider and get approved

**Goal.** Be allowed to create and publish courses.

**Preconditions.** A registered account that applied as an **Individual** professional ([signup-to-booking, Part A](signup-to-booking.md)).

**Steps.** Register (or use **Become a professional** on the profile) with **I also want to offer services as a professional** → **Individual** → pick services → create the account. With **Automatic approval** on (the default, Admin → Providers) you are verified at once and listed; with it off the application stays pending until an admin presses **Verify** (Admin → Providers). Companies are always reviewed by hand ([company journey](company-owner-venue.md#c1-sign-up-as-a-company-and-get-approved)).

**Errors.** A pending, rejected or suspended provider cannot save a published course: "The provider is not available right now." A suspended or deleted account sees "The account is not active."

### B2. Create and publish a course without a venue

**Goal.** A published course customers can find and book.

**Preconditions.** A verified provider; at least one active category to choose.

**Steps.**

1. **Services → Create course**, or **Manage courses** in the provider menu (`/provider/courses`) → **Create course** (`/provider/courses/create`; **Edit course** opens `/provider/courses/edit?id=…`). Both are dedicated pages, so clicking outside cannot discard the form. Unsaved values stay in the browser tab, separately for each provider and course, until saving succeeds.
2. Enter **Course name** (2–120 characters), **Category** (type in the combobox to filter translated names, sorted alphabetically; pick with a click or the arrow keys and Enter), description (up to 3000), **Level** and **Equipment needed**.
3. **Venue**: the selector appears only if you manage a venue; **No venue (independent course)** keeps the course yours alone. Without a venue enter **Address or location** (2–300), **City** and **Timezone** (default Europe/Rome), and the **Instructor** name; tick **Link my own instructor profile** to link your own profile (an admin may link anyone, anyone else gets "On a course without a venue you can only name yourself as instructor."). Linking an instructor makes the course hold an instructor lock (B2 overlap rule below).
4. Set **Maximum participants** (1–500) and **Lesson duration (minutes)** (10–480). Choose **Start date** and **Start time**.
5. **Repeats**: **One lesson**, **Daily** or **Weekly**. Repeating courses need an **End date**; weekly ones need at least one day; **Repeat every** is 1–12. A schedule can span at most three years; with an instructor linked, at most 400 upcoming lessons ("A course with a linked room or instructor can have at most 400 lessons. Shorten the period.").
6. **Lesson price** and **Full course price**: blank turns that option off, **0 makes it free**, and at least one is required ("Enter at least one price (0 for a free course)."). Prices are per participant, in EUR. Independent courses never get a discount.
7. **Booking notice (hours)** (default 2) and **Cancellation deadline (hours)** (default 24), both 0–720; **Waitlist when a lesson is full** (on by default); **Enrollment closed** to stop taking bookings. Keep **Status** on **Draft** until ready.
8. Set **Status** to **Published** and press **Preview lessons**: every generated date and local time is listed (and, if an instructor is linked, any clash: **Instructor: Conflicts with “X” (time)**). **Save course** stays disabled for a published course until the preview matches the current form, so preview again after any change. Save.
9. A published course appears in customer discovery. A linked service is kept in your service catalogue; edit it through Manage courses.

**Overlap protection.** While a course is published, each upcoming lesson holds its instructor (when linked; and its room, for a venue course). Another course or a moved lesson into the same instructor at an overlapping time is refused with the name and time of the course in the way; back-to-back classes are fine. Unpublishing, archiving, cancelling or moving a lesson frees its slot.

**Errors (red, under the form).**

| Situation | What you see |
|---|---|
| Time does not exist / happens twice (clock change) | "That time does not exist in the chosen time zone (clock change). Pick another time." / "That time happens twice…" |
| No lessons, no end date, no weekday, too long | "These settings produce no lessons." / "Enter an end date for a recurring course." / "Choose at least one weekday." / "The schedule is too long. Shorten the period." |
| Publishing a course whose first lesson is in the past | "The new date must be in the future." |
| Instructor already teaching then | "The instructor already teaches “X” at that time (time)." |
| Category not active | "Choose an active category." |
| Any other invalid field | "Some course fields are not valid. Check what you entered." |

**Once a course has bookings.** Its schedule, prices, venue, room and instructor are locked ("This course has bookings: venue, room, instructor, time zone and schedule are locked. Use Reschedule lesson."). Capacity can rise, but not fall below the seats confirmed plus held in an upcoming lesson ("Capacity cannot be lower than the seats already booked or held."). Name, description and policies can still be edited.

**Edge cases.** A provider cannot book their own course. Editing a published course keeps lessons' own room or substitute while the course value is unchanged. A course whose provider stops being verified leaves the list and the timetable until they are verified again.

### B3. Roster, attendance and direct payment

**Goal.** Know who is coming and record who paid.

1. **Manage courses → Participants** (on a course card) → choose a lesson. The roster shows private participant names, their booking total, **Paid** / **Payment pending**, a **No-show** badge on anyone marked Absent (with their running count from the second no-show), and the lesson's **Waitlist**. Public pages show counts only.
2. When a customer pays you directly, press **Record payment**, pick **Cash**, **Bank transfer**, **Satispay** or **Other**, **Confirm booking**. This records the discounted amount for the active booked lessons. It exists only for confirmed direct bookings that are not yet paid ("A payment can only be recorded on confirmed direct bookings."). An advance payment for the whole course is one payment; recording payment is separate from attendance.
3. After a lesson starts, set **Attendance** to **Present** or **Absent** for each confirmed participant; future lessons cannot be marked ("Attendance can only be marked for confirmed participants of a lesson that has started."). **Absent** is a no-show: the participant is flagged, and from the second no-show the roster shows the running count.
4. To stop taking reservations edit the course and tick **Enrollment closed**.

### B4. Add participants

See [Provider adds participants](#provider-adds-participants).

### B5. Lesson actions

For an upcoming lesson, **Participants → the lesson** offers:

- **Reschedule lesson**: a reason (required) and a new local time that is beyond the booking notice; the waitlist is closed and every participant is notified. Refused with "Please give a reason.", "The start time is not valid: pick a future time beyond the booking notice." or, while online holds exist for that lesson, "This lesson is not available."
- **Cancel lesson**: a reason (required); participants are released with refund obligations and told, the slot is freed, the waitlist is closed. Cancelling the last remaining lesson archives the course.
- **Change capacity**: raise or lower one lesson's places (1–500; not below the booked and held seats). Raising it seats waiting customers.
- **Remove participant**: a reason is optional; the seat is freed, the refund and notification follow as for a provider cancellation, and the seat goes to the waitlist. If the customer's own deadline has passed, a warning says the removal is recorded as a **late cancellation** (no fee); late cancellations are listed under the lesson.
- **Remove from waitlist** (confirm with **Confirm removal**): the entry leaves, positions are renumbered and the customer is told.
- **Cancel remaining lessons** (reason): archives the course and cancels every upcoming lesson.

A lesson that already started cannot be changed ("You cannot change a lesson that has already started."). **Substitute instructor** is also offered on an independent course, but the only choice there is yourself (an admin may pick anyone); it is meant for venue courses ([C2](#c2-venue-lesson-actions)).

### B6. Cancellations and refunds

Customers cancel individual future lessons in My course bookings before the deadline stored on their booking. Seats are released once; replaying a request does not release extra seats. For direct payments the cancellation creates **Refund due** entries under **Refunds** on **Manage courses**; return the money outside VFit, then press **Confirm refund paid**. Online (Stripe) cancellations create idempotent refunds automatically; processing refunds are reconciled by their Stripe IDs and failed refunds stay recorded for investigation. Refunds reduce the platform's recorded amount owed to the provider.

### Known limitations (individual provider)

- One lesson per calendar day per course; schedules are limited to three years.
- A booked course is locked (schedule, prices, venue, room, instructor); changes happen per lesson.
- Direct-payment refunds are manual: VFit records that you returned the money, it does not move it.
- The roster, refund and booking lists show the newest 500 records; the own-course list loads 50 at a time.
- An independent course has no partner discounts, no rooms, and the instructor can only be you (or anyone, set by an admin).
- Notification failures to a participant are visible but the enrollment is kept.

---

## Part C: Venue-linked courses

The set-up journeys belong to the people who do them: [company owner](company-owner-venue.md) (owns the venue, adds locations and rooms), [venue staff](venue-staff.md) (run it day to day) and [admin](admin-business-and-venues.md) (partner status, discounts, instructor links, staff records). What changes compared to Part B:

### C1. Create and publish a venue course

**Goal.** A published course in a room, taught by a venue instructor, shown in the venue timetable.

**Preconditions.** You own or staff the venue (or are an admin); the venue is a gym, school or studio; it has at least one active location with one active room; to **publish**, the venue's partner status is **Active** and the venue is active (a draft can always be saved); the venue's owner is a verified provider (they stay the provider of record and the payee).

**Steps.**

1. **Manage courses** (`/provider/courses?venue=<id>`; a selector switches venue when you manage several) → **Create course** (`/provider/courses/create?venue=<id>` pre-selects the venue). Without any location or room the editor says so and links **Add locations and rooms** to the panel at the bottom of the page.
2. **Venue** → the venue; then **Location** and **Room** (a single active location or room is picked for you), and **Venue instructor** (the venue's active linked instructors, or **Other (type a name)**, which holds no instructor lock and gives no instructor discount). The timezone is the location's and read-only ("The time zone comes from the location."); place text and city are filled in by the server.
3. Continue as in B2 steps 4–8. The preview marks every lesson whose room or instructor is already taken: **Room: Conflicts with “X” (time)**.
4. Save. Staff and admins create on the owner's behalf. Published venue courses appear in the venue's timetable and in the course list; discounts apply to customers.

**Errors.**

| Situation | What you see |
|---|---|
| Not the owner, staff or an admin of that venue | "You are not authorized to manage this venue." |
| Publishing while the venue is pending, suspended or off | "This venue is not active right now." (editing a published course also needs this, so unpublish first) |
| Venue without an owner | "This venue has no owner, so a course cannot be created on its behalf." |
| Location or room inactive or wrong | "The chosen location or room is not valid or not active." |
| Instructor not linked or no longer verified | "The chosen instructor is not valid for this venue." |
| Room or instructor already taken | "The room is already taken by “X” (time)." / "The instructor already teaches “X” at that time (time)." |
| More than 400 upcoming lessons | "A course with a linked room or instructor can have at most 400 lessons. Shorten the period." |

### C2. Venue lesson actions

The actions of B5 apply, plus **Substitute instructor** (pick another active instructor linked to the venue; reason optional; the instructor's day is checked for a clash and every participant is notified; existing bookings keep their price, new customers see the substitute's discount) and a room choice in **Reschedule lesson** (**Room for the new time**). The new slot is checked against the other courses' rooms and instructors.

### Known limitations (venue courses)

- See [venue staff](venue-staff.md#known-limitations) and [admin](admin-business-and-venues.md#known-limitations).
- A venue course keeps being listed when its venue is switched off or suspended; it cannot be booked until the venue is active again.

---

## Optional online checkout

Direct payments remain the default. A superadmin can enable Stripe globally and **Online course checkout** in Admin → Settings → Payments & subscriptions (both default off; the course switch needs Stripe on). Missing, loading or disabled settings hide the customer's online-payment option, and the server callables reject attempts to bypass this. A discounted price below 50 cents cannot be charged online.

When available, customers can choose **Pay online** at review. Stripe-hosted Checkout opens; on mobile its return uses the deployed web application. The browser return refreshes bookings; only a verified Stripe webhook confirms payment and converts held seats to confirmed seats. Initial enrollment holds last 30 minutes; starting Checkout aligns the hold with an immutable 31-minute expiry. Abandoned or expired holds are released by maintenance (and the seat goes to the waitlist). A payment received after expiry or cancellation is refunded rather than overbooking.

Online cancellations create idempotent Stripe refunds. Stripe funds are collected by the platform; automatic provider transfers are outside this release. **VFit escrow is future work.** It is not displayed or accepted as a booking payment option.

## Notifications

Course confirmations, payment confirmations, lesson changes/cancellations, upcoming lesson reminders and the unified-flow events use the existing in-app/push/email infrastructure and the customer's language (Italian, English, Spanish, French, German): "A spot opened up" (confirmed, or held for 30 minutes), "Waitlist closed", "Removed from the waitlist", "Instructor changed", lesson rescheduled, cancelled by the provider. Duplicate events do not create duplicate inbox entries; a promoted customer gets one notice, not two. Cancelled lessons skip reminders. Provider-side notices of a venue course open the venue's course page. Roster access is restricted to the customer, the course's provider, the venue's owner and active staff, and authorized admins.

## Staging verification

The staging URL is https://vfit-app-staging.web.app. See [staging deployment](../deployment/staging.md) for the latest deployed verification record, the **Unified courses hosting deploy** checklist and Stripe prerequisites. The journey can be exercised with the demo provider/customer accounts and the fixture venue that `scripts/smoke-unified-courses-staging.mjs --keep` leaves behind. Keep course checkout off until valid Stripe test secrets and the signed course webhook endpoint are configured.

## Provider adds participants

1. Open Manage courses → Participants and choose a future lesson. **Add participant** searches only clients linked to the course's provider (for a venue course, the venue owner's clients); type a name or email and select the person. Venue staff can do this for the venue's courses.
2. Choose one lesson or the whole course. Confirming reserves the selected seats with the usual capacity, duplicate and advance-notice checks, and the usual venue discount; there is no price confirmation step for staff. Payment remains directly with the provider; adding someone does not charge them ("Participant added. Payment is arranged directly with you."). A person who already has a place: "This participant already has a reservation."
3. If the person is missing, choose **New participant**. **Full name** and **Email** are required; a separate surname and phone are optional. An existing account with that email is reused and linked. A new email gets a pending account and provider relationship before enrollment. If the class is full, the relationship remains and retry reuses that identity. A client who is not yours: "This person is not one of your clients yet."
4. After adding, or from the participant row, optionally choose **Notify by email** or **Notify by phone**. Email delivery shows "Email sent." or "Email could not be sent. Try again." Phone prepares SMS/WhatsApp links ("Add a phone number to this client first." when there is none); the provider opens the composer and sends from their own device. This does not claim automatic SMS delivery.
5. New participants receive a private password setup link by email. Phone messages link to `/auth/participant`, which sends setup to the participant’s own email. Providers never receive password setup credentials. The participant sets their password and signs in using the existing email; their reservations and every provider relationship remain on the same account.

A provider can have many participants, and a participant can have many providers. Customer course bookings also create a missing relationship automatically. One provider cannot access or modify another provider’s roster.

## Find courses in general activity search

Customers can also use Search → enter a course name or activity → submit. The general booking results include matching published courses alongside providers. Course cards show the provider, location, next-lesson places, lesson/full-course prices and a **Lessons** link that opens the course booking screen. Text matching ignores case and accents; category chips match the course leaf or parent, and price filtering uses the lesson price when offered, otherwise the whole-course price. A full next lesson does not hide the course because later lessons may remain bookable. Load more courses to search subsequent pages.
