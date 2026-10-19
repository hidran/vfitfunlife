# VFit: register and book a company or association

[Versione italiana](business-signup.it.md).

This guide covers a business with one owner account in Italy. A company and an association use the same provider services, availability, bookings and payments as individual professionals. Business applications always need manual approval.

## Register the owner and the business

1. Open **Register**, choose email and password (or another supported sign-up method), and enter the owner's personal account details. The owner's name is separate from the public business name.
2. Select **I also want to offer services as a professional**, then **Company / Association**.
3. Enter the legal name and the 11-digit Italian VAT number. An association without a VAT number enters its organisation's 11-digit tax code. Spaces and an `IT` prefix are accepted; an invalid checksum produces an inline error.
4. Choose the legal form. An affiliation or registration number is optional. Enter a public name, city and website if wanted; leaving the public name blank uses the legal name. Select at least one service category.
5. Accept the terms and privacy policy, then create the account. The application stays **under review** while the team checks the tax ID. It does not appear in public search yet, even when individual providers are approved automatically.

If the number belongs to another account, the tax-ID field shows an error. Correct it and retry on the same form; the owner account already created is reused. Contact support if the registered number belongs to your organisation.

## Admin review

An administrator opens **Admin → Providers**, selects the company filter and opens the application. Check legal name, tax ID, legal form and affiliation against the applicant's information. Approve or reject using the displayed actions. If reviewed details changed while the page was open, reload and review them again before approving.

Approval enables the provider area and public listing. The owner must set a price, activate at least one service and review availability. Set a location to appear in nearby searches. Automatically created services start as inactive drafts.

For corrections, administrators use the business actions on the detail page. Changing the tax ID moves its uniqueness claim; converting to an individual removes the business map and claim. A rejected business keeps its claim until an administrator releases it. A live business cannot have its claim released directly.

## Search and book

A customer opens **Book a service**, searches the public or legal name and opens the company marked with the business badge. Select an active service, date and available time, accept the terms and submit the booking. The request and booking details show the company's public name. Confirmation and payments follow the existing provider booking flow described in [signup-to-booking.md](signup-to-booking.md).

## Edit the business profile

Open **Profile → Edit → Professional**. Change the public name, description, city or website, or upload/change/remove the logo. Save the business details; a selected logo is published only after saving. Search reflects the new name after its index updates.

Legal name, tax ID, legal form and affiliation are read-only for the owner. Contact support for corrections. Changing the owner's personal account name does not change the company's public name.

## Verification record

Verified on staging on 5 October 2026, code `1777547`, in Italian with light/dark themes. Signup, duplicate-tax-ID rejection, admin approval, search, booking and public name/logo editing passed. Italian/German signup checks ran at 320 and 390px. Temporary accounts and the test booking were removed.

See [screenshots and results](business-screenshots/README.md) and the [business accounts plan](../plans/2026-10-04-business-accounts-plan.md). Production publication (B11) remains outstanding.
