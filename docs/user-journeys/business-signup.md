# VFit: Business (company) signup journeys

How a **company** (a gym, school or studio) registers as a provider, gets approved by the back office, shows up in search and under **Gyms & schools**, manages its profile, and how an admin releases a P.IVA, step by step.

*Italian version: [business-signup.it.md](business-signup.it.md).*

> **Screenshots pending B10.** The steps below describe the code as built. The screenshots have not been captured yet: task B10 of the [business-accounts plan](../plans/2026-10-04-business-accounts-plan.md) records them on staging and saves them to `screenshots/` (this guide) and `screenshots-it/` (the Italian guide). Until then each step lists the file names to expect in a `Screen | File` table.

| | |
|--------|----------------------------|
| **Status** | Written from the code on `main`; not yet walked through on staging |
| **Device** | Mobile viewport 390 × 844, as for [signup-to-booking.md](signup-to-booking.md) |
| **Accounts** | A fresh company account (no real company data), the demo admin account, and a customer to search with |
| **Related** | [Business (company) accounts](../features.md#business-company-accounts), [`applyAsProvider` and friends](../backend/cloud-functions.md#provider-signup-and-business-accounts-functionssrcproviders) |

---

## The journey at a glance

| # | Company owner | Admin | Customer |
|--|------------------|------------------|------------------|
| 1 | Registers as a **Company** with legal name, P.IVA, public name, venue type and address | | |
| 2 | Sees **Request under review**: the P.IVA is being verified | Opens `/admin/providers`, filters **Companies**, opens the company and **verifies** it | |
| 3 | The company is live | | Searches **Book a service** for the public or legal name and sees the logo and the **Company** badge |
| 4 | Edits public name, description, website, city and logo | | |
| 5 | Saves a location so the venue can be found | | Opens **Gyms & schools** and finds the company's venue |
| 6 | | Releases a P.IVA claim so another company can register it | |

A company is **always** reviewed by a person, even when provider auto-approval is on (individuals still auto-approve).

---

## 1. The company registers

A new visitor chooses **Register as a provider**, which opens `/auth/register?as=provider`. After the personal details (name, email, password) the professional opt-in is already ticked: **I also want to offer services as a professional**.

A two-option control **You are registering as** offers **Individual** and **Company**. Choosing **Company** adds the company form:

- **Legal name** (ragione sociale) and **VAT number (P.IVA)** (partita IVA, 11 digits, with the check digit validated). Pasting spaces or an `IT` prefix is fine; the number is normalised.
- **Public name**, the name customers will see. Leave it empty to use the legal name.
- **Venue type**: Gym, School, Studio or *No fixed premises*. Any type except *No fixed premises* needs a **street address** and a **city**, and gets a venue when approved.
- **Website** (optional, `http://` or `https://`).

The owner then picks the services the company offers, accepts the terms and taps **Create account**.

Mistakes appear under the field that caused them, are announced to screen readers, and focus jumps to the first one:

- A VAT number that is not valid: *Invalid VAT number: 11 digits with a correct check digit are needed*.
- A VAT number another company already registered: *This VAT number is already registered*.

An existing customer can do the same from **Become a professional** on `/profile`, which has the same Individual / Company control.

| Screen | File |
|--------|------|
| Signup form with **Company** selected and the company fields filled in | `business-01-signup-company.png` |
| Inline error under the VAT number (invalid or already registered) | `business-02-signup-vat-error.png` |

> **Behind the scenes.** `applyAsProvider` validates the payload and, in one transaction, claims `businessVat/<P.IVA>` and writes the application as *pending*: `users.providerStatus: 'pending'`, `providerType: 'business'` and the `business` map on `instructors/<uid>`. Nothing is public yet. See the [function reference](../backend/cloud-functions.md#provider-signup-and-business-accounts-functionssrcproviders).

After submitting, the owner lands on the existing **Request under review** screen. For a company the text says the VAT number and company details are being verified.

| Screen | File |
|--------|------|
| Pending screen for a company | `business-03-pending.png` |

---

## 2. The admin reviews and approves

An admin (or superadmin) opens **Providers** (`/admin/providers`). The **Type** filter offers **All**, **Individuals** and **Companies**; choose **Companies**. Each company row carries a **Company** badge.

Opening the company shows the usual provider details plus a **Company** block: legal name, VAT number, public name, venue type, address, city, website and logo. The admin checks the legal name and P.IVA, then taps **Verify** (or **Reject**).

Approval:

- promotes the account to a provider, gives it default Mon-Fri 09:00-17:00 hours and one draft service per chosen service;
- creates the company's **venue**, `venues/biz_<uid>`, for any venue type except *No fixed premises*: owned by the company, **partner status pending**, not yet a partner;
- writes an audit-log entry.

Approving twice never creates a second venue. If a venue already exists at that id (for example an admin created one by hand), the approval is refused as a whole and the admin sees *This company's venue already exists, so nothing was approved. Check the venue in Venues, then try again.* Resolve the clash and approve again.

| Screen | File |
|--------|------|
| `/admin/providers` filtered to **Companies** | `business-04-admin-list-companies.png` |
| Company detail with the **Company** block and the Verify / Reject actions | `business-05-admin-company-detail.png` |

---

## 3. The company appears in search with the badge

A customer opens **Book a service** (`/booking`) and types the company's public name, or its legal name: both are indexed. The result row shows the company **logo** (once uploaded) and the **Company** badge next to the name. Tapping it opens the company page (`/providers/detail?id=...`), which carries the same badge, and from there the booking flow is the one individual providers use. Individual providers' cards are unchanged.

| Screen | File |
|--------|------|
| Search result for the company, with logo and badge | `business-06-search-badge.png` |
| The company's provider page | `business-07-provider-page.png` |

---

## 4. The owner edits the profile and logo

The owner opens `/profile/edit` and the **Professional** tab. The **Company details** section is saved on its own with **Save company details**. They can change:

- **Public name**: also updates the name shown in search (the index follows within moments);
- **Description**, **website** and **city**;
- the **logo**: **Change logo** opens the file picker; the new image appears in search and on the company page.

**Legal name, VAT number, venue type and address are read-only.** They are what the admin verified, so the form shows a hint (*Verified by an admin: contact support to change it.*) and the Firestore rules refuse any attempt to change them.

After saving, the form confirms *Company details saved*.

| Screen | File |
|--------|------|
| **Company details** on the Professional tab, frozen fields read-only | `business-08-edit-profile.png` |

---

## 5. The venue appears under Gyms & schools

`/fit/gyms` (**Gyms & schools**) lists every venue of type gym, school or studio. The company's venue is listed once it has a position: the owner saves a location from the **Your location** screen (`/provider/location`), and the venue copies the coordinates and city from it, and follows when the owner moves it (`syncBusinessVenueLocation`). Pending venues with coordinates are listed too.

The venue starts with partner status *pending*. An admin can open it under **Venues** (`/admin/venues`, which has an **Owner** column showing the company) and set its partner status and discounts. Only an *active* partner venue can publish and sell a class timetable.

| Screen | File |
|--------|------|
| **Gyms & schools** list with the company's venue | `business-09-gyms-and-schools.png` |

---

## 6. The admin releases a P.IVA

Each VAT number belongs to one company. A rejected company keeps its claim so the same person can re-apply; if a number is squatted or abandoned, an admin frees it.

On the company's detail page, in the **Company** block, tap **Release VAT number**. A dialog repeats the number (*VAT number ... will become available for a new registration. The company's details stay unchanged.*) and adds a stronger warning if the company is already verified and live. The admin may enter a **Reason**, then taps **Release**. The page confirms *VAT number released* (or *The VAT number was already free*). The release is written to the audit log in the same transaction; the company's own record keeps the number it declared.

Afterwards another company can register that VAT number.

| Screen | File |
|--------|------|
| **Release VAT number** dialog with the reason field | `business-10-admin-release-vat.png` |
