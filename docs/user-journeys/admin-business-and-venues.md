# Admin and superadmin: companies, venues and course settings

What an administrator does for the business and venue side of the platform. Company signup from the applicant's side: [business-signup.md](business-signup.md) and [company-owner-venue.md](company-owner-venue.md). Courses and lessons: [group-courses.md](group-courses.md). Staff side: [venue staff](venue-staff.md). All journeys: [index](README.md). Roles in detail: [roles and permissions](../backend/roles-and-permissions.md).

**Who can do what.** Admins and superadmins both verify and reject providers, correct company data, edit venues, link instructors and write staff records. Only a **superadmin** can delete a user (single or bulk), open **Admin → Settings** (payment switches) and delete a venue. Every mutation below writes an `audit_logs` entry.

**Screenshots.** Existing (staging, 20 October 2026, Italian, 390 px, dark): the [review card with venue type and address](business-screenshots/it-admin-review-venue-390-dark.png), [Admin → Venues with the Owner column](business-screenshots/it-admin-venues-owner-390-dark.png), the [venue detail](business-screenshots/it-admin-venue-detail-390-dark.png) and the [venue switched off after a conversion](business-screenshots/it-admin-venue-deactivated-390-dark.png), plus [approval](business-screenshots/it-admin-approved-dark.png). Missing: the three correction dialogs (change tax id, release claim, convert), the instructor-link panel, the staff record, the payment switches. Labels are English UI texts.

---

## A1. Review and approve a company

**Goal.** Verify that the tax id and legal data are real, then list the company and create its venue.

**Preconditions.** A company application is pending (it is always pending: the **Automatic approval** switch applies to individuals only). You are signed in as admin or superadmin.

**Steps.**

1. **Admin → Providers** (`/admin/providers`). Set **Account type** to **Companies and associations**, or look at **Pending applications**: each company row shows the **Business** badge, legal name, P.IVA / codice fiscale, legal form and affiliation number, with **Verify** and **Reject**. **Verify** stays disabled until the company details have loaded.
2. Open the provider (`/admin/providers?id=<uid>`). The **Business details** card shows what you are approving, in this order: **Legal name**, **P.IVA / Codice fiscale**, **Legal form**, **Affiliation number**, **Public name**, **City**, **Venue type**, **Street address**, **Venue** ("Created on approval" before approval, then **Open venue**), **Website**, **Description**.
3. Compare them with what you know of the applicant, then press **Verify**. The press sends the legal name, tax id, legal form, affiliation number, venue type and address you saw (`expectedReview`); the server approves only if they are unchanged ("approve what you saw").
4. Result: "Provider verified successfully." The company is listed, its provider area is open, and for Gym, School and Studio the venue `biz_<uid>` is created in the same transaction (pending partner, active, no discounts, linked to the company). A company without premises gets no venue.
5. To turn it down press **Reject**, write the **Rejection Reason** and press **Confirm Reject** ("Application rejected."). A company that is already verified shows no **Reject**.

**What an admin sees on errors.**

| Situation | Text |
|---|---|
| The company has not been reviewed on screen first | "A company can only be approved after reviewing its details: open its page and approve from there." (on the provider page: "…reload this page and review the company data again.") |
| The company changed after you opened it | "The company's data changed since you opened it — review the new details and approve again." The page reloads to show the new data |
| The tax id was released since (the company no longer holds it) | "This company no longer holds its tax id (it was released), so it can't be approved. Ask it to apply again or change its tax id." |
| Another account now holds the tax id | "This P.IVA / codice fiscale is already registered by another account. If that company was rejected, release its tax id from its page first." |
| The venue id `biz_<uid>` is held by a venue the company does not own | "This company's venue id is already taken by another record, so nothing was approved. Ask a superadmin to check the venue." |
| Contention | "Someone else changed this account at the same time. Reload the page and try again." |
| Anything else | "Could not save the decision. Try again." (Pending applications panel) / "Action failed. Please try again." (provider page) |

**Edge cases.**

- *Approved again after a rejection or conversion:* the company's own venue is switched back on (if the system had switched it off); admin edits, photos and partner status survive; no second venue is created. A venue an admin switched off by hand stays off.
- *Venue already exists and is linked:* nothing changes.
- *A venue deleted by an admin* is not recreated on approval.

## A2. Corrections: tax id, claim, conversion

Shown under the **Business details** card as three buttons. Each opens a confirmation dialog with an optional **Reason (optional)** (200 characters) and writes an audit entry.

1. **Change tax id / legal data**: edit **P.IVA / Codice fiscale**, **Legal name**, **Legal form**, **Affiliation number** → **Save changes** ("Legal details updated."). The tax-id reservation moves with the number and stays with this account; the approval status does not change. Errors: "Invalid P.IVA or codice fiscale: check the 11 digits.", "Enter the legal name.", "Name not valid or too long (max 120 characters).", "Affiliation number too long (max 40 characters).", and from the server "This P.IVA / codice fiscale is already registered by another account…" or "Another company's record still carries this P.IVA / codice fiscale (for example a rejected one whose tax id was released): convert that company to an individual or change its tax id first."
2. **Release tax-id claim** (only on a **rejected** company): "The P.IVA / codice fiscale … becomes available again and another account will be able to register it. This rejected company's details stay as they are." → **Release** ("Tax-id claim released."). Errors: "The tax id is still used by a pending or approved company: convert it to an individual or change its tax id instead." (a live company cannot have its claim released), "No account holds this tax id, so there is nothing to release."
3. **Convert to individual** (a warning dialog): "The business details and the tax-id claim are removed, and the public name reverts to the person's name. The verification status doesn't change." → **Convert** ("Account converted to an individual."). The company's venue is switched off. Error: "This account is no longer a company. Reload the page."

Other errors of the three dialogs: "This account is protected and can't be changed here." (a protected superadmin), "Account not found: it may have been deleted.", "Invalid account id. Reload the page.", "Reason not valid or too long.", "The action failed. Try again."

**Edge cases.** A converted account is a *verified individual*: it cannot apply as a company again ("The professional account type can no longer be changed. Contact support."); to let it, **Reject** the account first, then it can apply as a company and is queued pending. A rejected company keeps its tax-id claim until you release it.

## A3. Venues: list, partner status, discounts

**Goal.** Make a venue a partner so its courses can be published, booked and shown.

**Steps.**

1. **Admin → Venues** (`/admin/venues`): search by name or city, filter **Type** and **Status**; columns Venue, Location, Contact, Rating, **Partner** (Partner / Standard), **Status**, Photos (edit photos) and **Owner** (a link to the owner's provider page, "No owner" if none). **Add Venue** creates a venue by hand.
2. Open the venue (`/admin/venues?id=<id>`) → **Edit**. Set **Partnership status** (Pending / Active / Suspended), **Active**, **Manager account ID** (the owner's uid), **Member discount (%)** and **Partner instructor extra discount (%)** (whole numbers 0–100) → **Save**. Setting the status to Active also marks the venue a partner (`isPartner`).
3. For gym, school and studio venues the page shows two more panels: **Locations and rooms** (the same panel the owner has) and **Link instructor** (A4).

**What changes for others.** Active partner and active venue: owner and staff can publish venue courses; the venue page shows **Gym timetable** and **Next lessons**; the timetable opens; customers get the member discount on every lesson and the extra when the lesson's instructor is an active partner. Pending or Suspended: drafts only, "This venue is not active right now." on publish and on booking, timetable unavailable. The venue and its published courses stay listed.

**Errors.** The form blocks empty name, street, city, ZIP or country, and numbers outside 0–100.

**Edge cases.** A company venue starts pending with no discounts. Admin edits to the name are overwritten by a later rename of the company's public name (the owner's saved location and name win); the slug (web address) never changes.

## A4. Instructor links

**Goal.** Let a venue's courses name an instructor, and give that instructor partner status.

**Preconditions.** The instructor is a **verified** provider. You know their account id (uid): the panel takes the id typed by hand.

**Steps.** On the venue's page, **Link instructor** → **Instructor ID**, **Partnership status** (Pending / Active / Suspended), **Active** checkbox → **Link instructor**. The list below shows name · id · Active / Suspended. The link makes the instructor selectable in the venue's course editor and substitutions; the partner status makes lessons they teach earn customers the venue's partner instructor extra.

**Errors.** Any failure (id unknown, instructor not verified, not a gym/school/studio venue, not admin) shows "Operation failed." (the server's specific reasons, "The instructor must be a verified provider.", "Invalid instructor partnership status." and "This action is reserved for administrators.", are not shown by this panel).

**Edge cases.** The partner status is stored on the *instructor*, so it applies at every venue they teach in; the link's **Active** flag is per venue. A deactivated link keeps the instructor on existing courses but removes them from the choices.

## A5. Venue staff records

**Goal.** Give a person access to run one venue's courses ([venue staff journey](venue-staff.md)).

**There is no screen for this.** Create the document `venueStaff/{staff uid}` in the database with `venueId` (the venue's id) and `isActive: true` (set `isActive: false` or delete the document to remove access). Firestore rules let only admins write it. One document = one staff account = one venue. Check that the person's account exists and is active.

## A6. Deleting a user: what happens to venues and courses

**Superadmin only.** **Admin → Users** → the user → delete (reason required), or bulk delete. A protected superadmin cannot be deleted. The cascade, in order: the Auth account, the instructor profile and its subcollections, provider applications, the company's tax-id claims (freed), the company's own venue `biz_<uid>` (switched off, marked as a system deactivation so a later approval can bring it back; **never deleted**), the person's files, and last the user profile.

Kept on purpose: bookings, course enrollments, payments, transactions and audit logs. Open bookings are **not** cancelled or refunded by the deletion. Other venues whose owner field names the deleted account are left alone. The provider's courses stop being listed once the profile is gone.

## A7. Course settings and payment switches

1. **Admin → Providers** (top of the list): **Automatic approval** for individual professionals (on by default; companies are never automatic). Off means every application waits in **Pending applications**.
2. **Admin → Settings → Payments & subscriptions** (superadmin only; others are sent back to the dashboard): **Stripe payments**, **VIP subscription sales**, and **Online course checkout** ("Off by default. Requires Stripe. Funds are collected by the platform; provider transfers must be managed separately."). The course switch needs Stripe payments on, and turning Stripe off turns it off too. **Save**; the server audits the change. With either switch off, customers see no **Pay online** option and the callables refuse online payment.

Error: "Could not save the payment settings."

## Known limitations

- **Instructor links need a typed uid**; there is no search, and the panel's errors are all "Operation failed."
- **No staff screen** (A5): staff are created directly in the database.
- Partner status of an instructor is global (stored on the instructor), the link flag is per venue.
- The admin venue form saves `address` as an object (street, city, ZIP, country) and does not update the venue's top-level `city`, while the business-venue builder and the public venue page use a plain text address. After an admin edits a company venue, check its public page (by code reading; not verified in a browser).
- A venue with partner status *pending* and coordinates is public in Gyms & schools; its published courses stay listed when a venue is suspended or switched off.
- A venue deactivated by a rejection, conversion or deletion is brought back by a later approval only if the system switched it off; a hand-switched-off venue stays off.
- A converted company cannot become a company again without an admin first rejecting the account.
- Deleting a user does not cancel or refund that provider's open course bookings.
- The Stripe switches are off by default and staging runs without valid Stripe test secrets until [staging deployment](../deployment/staging.md) says otherwise (deployment state; not checkable in code).
- `/fit/gyms` without a known location lists only the 50 best-rated venues.
