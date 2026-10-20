# VFit: register and book a company or association

[Versione italiana](business-signup.it.md).

This guide covers a business with one owner account in Italy. A company and an association use the same provider services, availability, bookings and payments as individual professionals. Business applications always need manual approval.

## Register the owner and the business

1. Open **Register**, choose email and password (or another supported sign-up method), and enter the owner's personal account details. The owner's name is separate from the public business name.
2. Select **I also want to offer services as a professional**, then **Company or association**.
3. Enter the legal name and the 11-digit Italian VAT number. An association without a VAT number enters its organisation's 11-digit tax code. Spaces and an `IT` prefix are accepted; an invalid checksum produces an inline error.
4. Choose the legal form. An affiliation or registration number is optional. Enter a public name and website if wanted; leaving the public name blank uses the legal name. Choose the **venue type** (Gym, School, Studio, or No fixed premises). For Gym, School and Studio the **street address** and the **city** are required; with No fixed premises no venue is created. Select at least one service category.
5. Accept the terms and privacy policy, then create the account. The application stays **under review** while the team checks the tax ID. It does not appear in public search yet, even when individual providers are approved automatically.

If the number belongs to another account, the tax-ID field shows an error. Correct it and retry on the same form; the owner account already created is reused. Contact support if the registered number belongs to your organisation.

## Admin review

An administrator opens **Admin → Providers**, selects the company filter and opens the application. Check legal name, tax ID, legal form and affiliation against the applicant's information. Press **Verify** to approve, or **Reject** (with a reason) to turn the application down. If reviewed details changed while the page was open, reload and review them again before approving.

Approval enables the provider area and public listing. The owner must set a price, activate at least one service and review availability. Set a location to appear in nearby searches. Automatically created services start as inactive drafts.

### The venue created on approval

When the approved company chose Gym, School or Studio, approval also creates its venue (`venues/biz_<owner id>`) in the same step, with the public name, venue type, street address and city, owned by the company and not yet a partner. The admin review card shows venue type and address, and approving sends them with the other reviewed facts, so a change made while the page was open must be reviewed again. The venue appears under **Gyms & schools** (`/fit/gyms`, Italian *Palestre e scuole*) once it has coordinates: save the location in the provider area (**Location**) and the venue follows it, and follows later renames of the public name. Administrators find it under **Admin → Venues** (Owner column) and can promote it to a partner on its detail page. Venue type and address are fixed after signup. Rejecting the company, converting it to an individual or deleting the owner deactivates the venue (it leaves public listings); approving the company again reactivates it (a venue an administrator switched off by hand stays off).

Screenshots from the reconciled build (staging, 20 October 2026): the admin [review card with venue type and address](business-screenshots/it-admin-review-venue-390-dark.png), the [new venue in Admin → Venues with its Owner column](business-screenshots/it-admin-venues-owner-390-dark.png) and its [detail page](business-screenshots/it-admin-venue-detail-390-dark.png), the venue in [Gyms & schools after “Near me”](business-screenshots/en-gyms-near-me-venue-390-light.png) ([Italian, dark](business-screenshots/it-gyms-near-me-venue-390-dark.png)), the [venue page](business-screenshots/en-venue-page-390-light.png), and the [venue switched off after converting the company to an individual](business-screenshots/it-admin-venue-deactivated-390-dark.png).

For corrections, administrators use the business actions on the detail page. Changing the tax ID moves its uniqueness claim; converting to an individual removes the business map and claim. A rejected business keeps its claim until an administrator releases it. A live business cannot have its claim released directly.

## Search and book

A customer opens **Book a service**, searches the public or legal name and opens the company marked with the **Business** badge (Italian *Azienda*; the venue itself in Gyms & schools carries no such badge). Select an active service, date and available time, accept the terms and submit the booking. The request and booking details show the company's public name. Confirmation and payments follow the existing provider booking flow described in [signup-to-booking.md](signup-to-booking.md).

## Edit the business profile

Open **Profile → Edit → Professional**. Change the public name, description, city or website, or upload/change/remove the logo. Save the business details; a selected logo is published only after saving. Search reflects the new name after its index updates.

Legal name, tax ID, legal form and affiliation are read-only for the owner. Contact support for corrections. Changing the owner's personal account name does not change the company's public name.

## What comes next

A company with a venue continues in [company-owner-venue.md](company-owner-venue.md) (locations and rooms, partner status, instructors, venue courses, staff, what happens when the company is rejected or converted); the admin side is in [admin-business-and-venues.md](admin-business-and-venues.md). All journeys: [index](README.md).

## Known limitations

- Legal name, tax id, legal form, affiliation number, venue type and address are fixed for the owner after signup; corrections go through support and an admin.
- A rejected company keeps its tax id reserved until an admin releases it; a company converted to an individual cannot apply as a company again unless an admin first rejects the account (`provider_type_locked`).
- A venue created on approval is `pending` and non-partner; with coordinates it is already public in Gyms & schools, and without a known location `/fit/gyms` lists only the 50 best-rated venues, so a new venue appears with **Near me**.
- The booking detail reads the provider's public profile, so the Business badge and logo disappear there if the profile is not readable (open follow-up).
- The service picker prints "1 services selected" (no plural forms yet, follow-up D9).
- Field limits: names 120, city 80, address 200, website 200, description 1000, affiliation number 40 characters.
- No notification is sent to the owner when the review ends (by code reading); the profile shows the state.

## Verification record

Re-verified on staging on 20 October 2026 on the reconciled build (`f3abc70`), including the venue steps: see [business-reconciled-verification.md](business-reconciled-verification.md). Earlier run: verified on staging on 5 October 2026, code `1777547`, in Italian with light/dark themes. Signup, duplicate-tax-ID rejection, admin approval, search, booking and public name/logo editing passed. Italian/German signup checks ran at 320 and 390px. Temporary accounts and the test booking were removed.

See [screenshots and results](business-screenshots/README.md) and the [business accounts plan](../plans/2026-10-04-business-accounts-plan.md). The business release was published to production on 2026-10-06.
