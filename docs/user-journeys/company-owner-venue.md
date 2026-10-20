# Company owner: the venue and its courses

[Versione italiana](company-owner-venue.it.md). Builds on [business-signup.md](business-signup.md) (register, review, public listing, profile) and on [group-courses.md](group-courses.md) (how courses, lessons and bookings work). Other actors: [venue staff](venue-staff.md), [admin](admin-business-and-venues.md), [index](README.md).

A **company owner** is one account in Italy that applied as **Company or association** with a venue type of Gym, School or Studio. When an admin verifies the company, the system creates the company's venue; the owner then runs the venue's locations, rooms and courses. There is one owner per company for now.

**Screenshots.** The signup, admin review, venue-on-approval and venue-page screens exist (20 October 2026 re-shoot on staging, see [business-screenshots](business-screenshots/README.md)). Nothing is embedded yet for the owner's course screens (the **Locations and rooms** panel, the venue course editor); a capture run of the owner's venue course page was in progress when this was written (see the [index](README.md#screenshots-status)). Labels are English UI texts.

---

## C1. Sign up as a company and get approved

**Goal.** A verified company with a venue.

**Preconditions.** Nobody else holds the tax id; the owner is a signed-in or new account.

**Steps** (details and screenshots in [business-signup.md](business-signup.md)).

1. **Register** → **I also want to offer services as a professional** → **Company or association**.
2. Fill **Legal name**, **P.IVA / Codice fiscale** (11 digits, checksum), **Legal form** (Company (SRL, SAS…), Sole trader, Association / club, Other), optional **Affiliation number**, **Public name**, **Venue type** (Gym, School, Studio, No fixed premises), **Street address** and **City** (both required for Gym, School and Studio), optional description and website, and at least one service category.
3. Accept the terms and create the account. The application is **pending**, even with automatic approval on for individuals; it does not appear in public search yet (a pending account can open the provider area, but nothing of it is public).
4. An admin reviews and presses **Verify** ([admin journey](admin-business-and-venues.md#a1-review-and-approve-a-company)). The company is listed publicly (public name, logo, the **Business** badge, Italian *Azienda*), and, for Gym, School and Studio, the venue `biz_<owner id>` is created in the same step.

**What the owner sees on errors** (under the field, with focus on it; the account already created is reused when the form is sent again).

| Situation | Text |
|---|---|
| Checksum wrong | "Invalid P.IVA or codice fiscale: check the 11 digits." |
| Tax id held by another account | "This P.IVA / codice fiscale is already registered by another account. If it is your business, contact support." |
| Tax id of an approved company changed | "The P.IVA / codice fiscale of an approved business can't be changed. Contact support." |
| Names too long | "Name not valid or too long (max 120 characters)." |
| Premises without address or city | "The street address is required for a venue" / "The city is required for a venue" |
| No venue type chosen | "Choose a venue type" |
| Other limits | city max 80, address max 200, affiliation number max 40, description max 1000, website max 200 characters, each with its own message |
| Already an approved company | "Your business is already approved. To change its details, go to your profile or contact support." |
| Verified individual applying as a company | "The professional account type can no longer be changed. Contact support." |
| Individual application from a company account | "This account is already registered as a company or association, so it can't apply as an individual. Contact support to change the account type." |
| Lost a race | "Something changed while saving, please try again." |

**Edge cases.**

- *Pending review:* the profile shows "Our team is checking these details. To change them, contact support."
- *Rejected:* the provider area is closed to the account; the profile shows "Your application was not approved. To find out more or to change these details, contact support." The tax id stays reserved for the account until an admin releases it. Applying again queues the application as pending again; an admin must decide.
- *Approved with no premises ("No fixed premises"):* no venue is created; the company is a plain business provider and runs [independent courses](group-courses.md#part-b-individual-provider).
- *The admin changes your details while reviewing:* the approval is refused for the admin ("The company's data changed since you opened it — review the new details and approve again."); nothing is approved until they review the new data.

## C2. The venue the system created

**Goal.** Understand what the venue is and where it appears.

1. The venue is named after your **public name** (legal name if blank), has your **venue type**, **street address** and **city**, you as owner, `partnerStatus: pending` and no discounts. It is **active** but **not yet a partner**.
2. It appears under **Gyms & schools** (`/fit/gyms`) only once it has coordinates: save your address under **Location** in the provider menu (`/provider/location`) and the venue follows it (and later renames of the public name). Customers find it with **Near me**; without a known location the list shows only the 50 best-rated venues, so a new unrated venue may be missing there.
3. Admins find it under **Admin → Venues** with your account in the **Owner** column.
4. Venue type and address are fixed after signup, like the other legal fields; contact support to change them. Only admins change the venue itself (photos under **Admin → Venues**, partner status and discounts on its page); the owner has no screen for its photos, opening hours or description.

## C3. Set up locations and rooms

**Goal.** Rooms that courses can use.

**Preconditions.** You are the venue's owner (or staff, or an admin); the venue is a gym, school or studio.

**Steps.**

1. Provider menu → **Manage courses**. If you manage a venue, the **Venue** selector lists it; choose it (`/provider/courses?venue=<id>`, titled "Courses at <venue name>").
2. Scroll to **Locations and rooms** (also reachable from the course editor's **Add locations and rooms** link). An empty venue says "No locations yet. Add the first one to create courses."
3. **Add location**: **Location** (name), **Address**, **City**, **Time zone** (an IANA zone such as Europe/Rome; the default is Europe/Rome) → **Add location**. Each location shows its address, city and zone, with **Active** / **Inactive** and **Deactivate** / **Reactivate**.
4. **Add room**: choose the location, type the **Room** name → **Add room**. Rooms have the same **Deactivate** / **Reactivate** buttons.
5. The panel lists **Linked instructors** (name, Active / Inactive) once an admin has linked some ([admin journey](admin-business-and-venues.md#a4-instructor-links)).

**Errors** (red text under the forms): a name or address shorter than 2 characters is refused by the form; an unknown zone gives "Invalid time zone."; someone who does not manage the venue gets "You are not authorized to manage this venue."; a venue that is not a gym, school or studio gives "Venue not found."; a missing location gives "Location not found."

**Edge cases.** Locations and rooms are never deleted, only deactivated, because lessons keep a lock on their room and a course takes its timezone from its location. A course keeps showing a room that was switched off after it was chosen.

## C4. Get the venue ready: partner status and instructors

These are admin actions; the owner cannot do them.

1. The venue starts **pending**. Until an admin sets **Partnership status** to **Active** (and the venue is active), the owner can save drafts but cannot publish a venue course ("This venue is not active right now."), the venue page has no **Gym timetable** button or **Next lessons**, and the timetable says it is not available.
2. The admin may also set the **Member discount (%)** and the **Partner instructor extra discount (%)** (0–100). Customers get the member discount on every lesson of the venue; the instructor extra applies when the lesson's instructor is an active partner.
3. The admin links verified instructors to the venue and sets each one's partner status. The owner picks only linked, active instructors when authoring (or **Other (type a name)**).

No screen tells the owner the venue's partner status; they find out when publishing is refused.

## C5. Create and publish venue courses

**Goal.** Courses in your rooms, taught by your instructors, in the weekly timetable.

**Preconditions.** C3 done (an active location with an active room); for publishing, C4 step 1 done; you are a verified provider (you are the provider of record and payee).

**Steps.** As in [group-courses.md, C1](group-courses.md#c1-create-and-publish-a-venue-course): **Manage courses → (venue) → Create course** → **Venue**, **Location**, **Room**, **Venue instructor**, schedule, prices, notice and cancellation → **Preview lessons** (it marks any lesson whose room or instructor is taken) → **Published** → **Save course**.

**Errors.** The table in [group-courses.md, C1](group-courses.md#c1-create-and-publish-a-venue-course) applies: "The room is already taken by “X” (time).", "The instructor already teaches “X” at that time (time).", "This venue is not active right now.", "The chosen location or room is not valid or not active.", "The chosen instructor is not valid for this venue.", "A course with a linked room or instructor can have at most 400 lessons. Shorten the period."

**Edge cases.**

- *Overlap protection:* a published course's upcoming lessons hold the room and the instructor; back-to-back is fine; unpublishing, archiving, cancelling or moving a lesson frees the slot.
- *Course with bookings:* schedule, prices, venue, room and instructor are locked; use the lesson actions ([venue staff](venue-staff.md#s3-lesson-actions)).
- *Venue switched off or suspended later:* published courses stay listed but cannot be booked ("This venue is not active right now."); to edit one, set it back to **Draft** first.

## C6. Staff

Venue staff are accounts that run the venue's courses with you ([venue staff journey](venue-staff.md)). **There is no screen to add them**: an admin creates the `venueStaff/{staff uid}` record (`venueId`, `isActive`) directly in the database. Ask support.

## C7. Edit the company profile

**Profile → Edit → Professional** ("Company details"): public name, description, website, city and logo; save with **Save business details**. Legal name, tax id, legal form, affiliation number, venue type and address are read-only. Renaming updates the venue's name as well (its web address does not change). See [business-signup.md](business-signup.md#edit-the-business-profile).

## C8. When things end

| Event | What happens to the venue and its courses |
|---|---|
| Company **rejected** by an admin | Provider area closes; the venue is switched off; the provider's courses leave the list and timetable (they are no longer eligible); existing bookings are kept |
| Company **converted to an individual** by an admin | The business data and tax-id reservation are removed, the venue is switched off, the account stays a verified provider. Its courses stay listed but venue courses cannot be booked; the venue leaves the owner's venue selector while the courses stay in the owner's own **Manage courses** list. The owner cannot become a company again by applying ("The professional account type can no longer be changed. Contact support."); an admin must first reject the account |
| Company **approved again** | The venue is switched back on (if the system had switched it off); photos, discounts and partner status that an admin set are kept; no second venue is created |
| Owner account **deleted** (superadmin) | The venue `biz_<owner id>` is switched off, not deleted; the tax-id reservation is freed; bookings and payments are kept as records. Other venues the account merely manages are untouched |

## Known limitations

- Venue type, address and the other legal fields are fixed after signup; changes go through support.
- The owner cannot add staff, link instructors, set partner status or discounts, or edit the venue's photos, hours and description: those are admin actions.
- No screen shows the owner the venue's partner status.
- A venue with partner status *pending* and coordinates is publicly listed in Gyms & schools before any admin action (decision: keep). Its timetable is not available until it is an active partner.
- Without a known location `/fit/gyms` shows only the 50 best-rated venues, so a new unrated venue appears with **Near me**.
- A converted company cannot apply as a company again without an admin first rejecting the account.
- The pending-review state is visible only as a note on the profile; the decision code sends no notification (by code reading), so the owner sees the result on their next visit.
- One owner per company; the venue list in the course pages shows the owner's venues or the single venue of a staff record.
- Field limits: public and legal name 120, city 80, address 200, website 200, description 1000, affiliation number 40 characters.
- Plural copy "1 services selected" in the service picker is not pluralised (open follow-up D9).
