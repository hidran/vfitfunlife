# Venue staff and managers

Who this is for: people who run a venue's courses day to day. The **owner** of the venue (usually a [company owner](company-owner-venue.md)) can do everything here too; **staff** are accounts an admin has linked to one venue. Both work on the venue's courses on behalf of the owner, who stays the provider of record and the payee. How courses, lessons and bookings work: [group-courses.md](group-courses.md). Admin side: [admin journey](admin-business-and-venues.md). All journeys: [index](README.md).

**Screenshots.** None is embedded yet; a capture run covering the owner/roster screens was in progress when this was written (see the [index](README.md#screenshots-status)). Nothing covers the staff entry tab or the lesson-action forms. Labels are the English UI texts.

---

## S1. Get access and open the venue

**Goal.** Land on the venue's course management.

**Preconditions.** Either you own the venue, or an admin created your staff record `venueStaff/{your uid}` with the venue's id and `isActive` not false (there is no screen for this, see [Known limitations](#known-limitations)). The venue is active (an inactive venue disappears from your access).

**Steps.**

1. Sign in with your customer account. If you only staff a venue (you are not a verified or pending provider), the mode switch (side menu, **Profile**) shows two tabs, **Customer** and **Venue courses**. Press **Venue courses**.
2. You land on **Manage courses** for the venue (`/provider/courses?venue=<id>`, titled "Courses at <venue name>"). The provider menu shows only **Manage courses**: any other provider page sends you back here.
3. If you own or staff several venues, a **Venue** selector switches between them. (A staff record names a single venue; an owner can have several.)

**Errors.**

| Situation | What you see |
|---|---|
| `?venue=` is not a venue you own or staff | "This venue does not exist or you do not manage it." with a **Manage courses** link; nothing is read |
| Your staff record was switched off (`isActive: false`) or the venue is switched off | The tab and the venue disappear; a direct action returns "Only the course owner or the people who manage its venue can do this." |
| Your account is suspended or deleted | "The account is not active." |

## S2. Manage the venue's courses on behalf of the owner

**Goal.** Create, edit and publish courses, and keep the rooms in order.

**Preconditions.** S1; for publishing, the venue is an **Active** partner and its owner is a verified provider.

**Steps.**

1. **Create course** (`/provider/courses/create?venue=<id>`, the venue pre-selected) or **Edit course** on a course card. The form is the venue form of [group-courses.md, C1](group-courses.md#c1-create-and-publish-a-venue-course): **Venue**, **Location**, **Room**, **Venue instructor**, schedule, prices, notice and cancellation, **Preview lessons**, **Published**, **Save course**. The course belongs to the owner; you are not shown as its provider.
2. Keep **Locations and rooms** up to date at the bottom of the page: **Add location**, **Add room**, **Deactivate** / **Reactivate** (never delete). Staff can do everything the owner can in this panel.
3. Courses of the venue are listed alphabetically (up to 200). Each card shows the state (**Draft**, **Published**, **Archived**), the place, the number of lessons and the capacity, with **Edit course** and **Participants**.

**Errors.** As in [group-courses.md, C1](group-courses.md#c1-create-and-publish-a-venue-course): "This venue is not active right now.", "This venue has no owner, so a course cannot be created on its behalf.", "The provider is not available right now." (the owner is not a verified provider), "The room is already taken by “X” (time).", "The instructor already teaches “X” at that time (time).", "You are not authorized to manage this venue."

**Edge cases.** Staff-created courses can be edited and archived by the owner and by any other staff; editing a published course while the venue is not an active partner is refused, so set it to **Draft** first. A booked course keeps its venue, room, instructor, schedule and prices locked.

## S3. Lesson actions

**Goal.** Handle the day: moves, substitutions, capacity, people.

**Steps** (all under **Participants** on the course card → choose a lesson in **Lesson**; each action needs an upcoming lesson, and a reason where noted).

1. **Reschedule lesson** → **Reason** (required), the new local date/time (in the course's timezone), **Room for the new time** (the venue's active rooms; defaults to the lesson's current room) → **Confirm booking**. The new slot is checked against other courses' rooms and instructors; the lesson's waitlist is closed; every participant is notified. Not possible while online payment holds exist on that lesson ("This lesson is not available.") or inside the booking notice ("The start time is not valid: pick a future time beyond the booking notice.").
2. **Substitute instructor** → pick another active instructor linked to the venue → optional **Reason** → **Confirm substitution**. The instructor's day is checked for a clash ("The instructor already teaches “X” at that time (time)."); participants are notified ("Instructor changed"); existing bookings keep the price they paid, new customers see the substitute's discount. The current instructor is not offered.
3. **Change capacity** → **Maximum participants** between the seats taken and 500 → **Save**. Raising it seats customers waiting for that lesson, in order. Lowering it below the booked and held seats: "Capacity cannot be lower than the seats already booked or held."
4. **Remove participant** (on the participant) → optional **Reason** → **Confirm removal**. The seat is freed, the refund obligation and the customer's notice follow as for a provider cancellation, and the seat is offered to the waitlist. If the customer's own cancellation deadline has passed, a warning says "The customer’s cancellation deadline has passed: this removal is recorded as a late cancellation (no fee)." and the customer is listed under **Late cancellations** (with a count from the second).
5. **Remove from waitlist** (in the lesson's **Waitlist**, ordered by position) → **Confirm removal**. Positions renumber; the customer is told they were removed.
6. **Cancel lesson** → **Reason** (required): participants are released with refund obligations and told, the room and instructor are freed, the waitlist is closed. Cancelling the last remaining lesson archives the course. **Cancel remaining lessons** (course level, reason required) archives the course and cancels every upcoming lesson.

**Errors.** "Please give a reason." (no reason where one is required), "You cannot change a lesson that has already started.", "This lesson is not available." (the lesson is cancelled, or has held seats for a move), "The chosen instructor is not valid for this venue.", "The room is already taken by “X” (time).", "The chosen location or room is not valid or not active.", "Participant not found."

**Edge cases.**

- *Full lesson with a waitlist:* removing a participant, cancelling a booking or raising capacity automatically books the first waiting customers (confirmed for direct payment; a 30-minute hold for online payment).
- *Lesson inside the notice window:* the waitlist is closed instead of promoted.
- *Venue suspended:* promotion for the venue's lessons stops (entries are kept), new bookings are refused, existing bookings are untouched.

## S4. Roster, attendance, payments and refunds

1. **Participants → lesson** shows each participant's name, total, **Paid** / **Payment pending**, and a **No-show** badge on anyone marked **Absent** (with the customer's running count from the second no-show).
2. After the lesson starts, set **Attendance** to **Present** or **Absent**. Before it starts the selector is disabled.
3. **Record payment** (direct, unpaid, confirmed bookings only) → **Cash**, **Bank transfer**, **Satispay** or **Other** → **Confirm booking**. The amount recorded is the customer's discounted amount; the customer is notified.
4. **Refunds** (list at the bottom of the page for the whole venue): a direct payment that was cancelled shows **Refund due**; return the money outside VFit, then press **Confirm refund paid**. Online (Stripe) refunds are automatic and show no button.
5. **Add participant** (future lessons): search the venue owner's linked clients or choose **New participant** (full name and email required) → one lesson or the whole course → payment stays direct; optionally **Notify by email** or **Notify by phone** ([details](group-courses.md#provider-adds-participants)).

**Errors.** "A payment can only be recorded on confirmed direct bookings.", "Attendance can only be marked for confirmed participants of a lesson that has started.", "This refund must be made directly to the customer.", "This person is not one of your clients yet.", "This participant already has a reservation."

## Known limitations

- **No screen adds, lists or removes staff.** An admin writes the `venueStaff/{uid}` document (`venueId`, `isActive`) in the database; the rules allow only admins to write it. One staff account belongs to one venue.
- Staff are customers with an extra tab: they see no provider dashboard, earnings, services, clients or settings, and cannot change the venue's partner status, discounts, instructor links, photos or details.
- A staff-only account's **Venue courses** tab opens the first venue found; only owners with several venues get a selector.
- The venue's course list shows at most 200 courses; refund and booking lists show the newest 500 records.
- Publishing needs the owner to be a verified provider; a suspended or unverified owner blocks staff from publishing ("The provider is not available right now.").
- Staff cannot see the venue's partner status; they learn it when publishing is refused.
- When the venue is switched off (for example the company was rejected or converted) staff lose access to it entirely.
