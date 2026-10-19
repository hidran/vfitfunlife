# Business (company) accounts: browser verification (plan task B10)

| | |
|--|--|
| **Date** | 19 October 2026 |
| **Environment** | Staging only: `https://vfit-app-staging.web.app`, backend `vfit-app-staging` (production was not touched) |
| **App commit** | `cf505de` (the deployed build was not re-checked against this SHA) |
| **Device** | Chromium via Playwright, 390 x 844, dark theme (light where noted); 320 x 700 for the narrow-width checks |
| **Languages** | English and Italian for the whole journey; German for the 320 px badge check |
| **Guides updated** | [business-signup.md](business-signup.md), [business-signup.it.md](business-signup.it.md) |
| **Screenshots** | `screenshots/business-*.png` (English), `screenshots-it/business-*.png` (Italian) |

Application code was not changed. Where something deviates from the guide or the plan, it is reported below with steps, expected and actual results.

## Result per step

| # | Step | Result | Notes |
|--|--|--|--|
| 1 | Register as a company (EN + IT), inline errors, pending screen | **PASS** | Defects D7, D9. |
| 2 | Second account, same P.IVA: inline error with focus on the field | **PASS** | Focus lands on `#business-vatNumber` (EN and IT, also via `/profile` > Become a professional). See D1 for what happens next. |
| 3 | Admin: type filter, company block, approve, venue created | **PASS** | No index error. Defects D2, D3, D12. |
| 4 | Owner activates a priced service; customer finds the company; badge; booking shows the company name | **PASS** | D6, D14. |
| 5 | Owner edits profile and logo; frozen fields; search index follows | **PASS** | D8. |
| 6 | `/fit/gyms` lists the venue; venue page opens | **PASS, with caveat** | Only after "Near me" (D4). Map UI works in headless Chromium. |
| 7 | Admin "Release VAT": confirm, toast, second click, re-claim | **PASS** | EN and IT. Re-claim by another application confirmed. |
| 8 | Accessibility spot checks | **PASS with findings** | D3, D5, D10, D11, D13, D15. |

Console and network, every step: **no `permission-denied`, no missing-index errors, no failed Firestore requests.** The only errors were the expected ones from deliberate negative tests: `identitytoolkit accounts:signUp` 400 (staging allowlist refusal once, `auth/email-already-in-use` once), `applyAsProvider` 409 `business_vat_taken` (twice), plus a harmless `[notifications] inbox listener failed: Firestore shutting down` when a session is cleared.

## Step details

### 1. Registration (EN `business-01/02/03`, IT same names)

- `/auth/register?as=provider`, **Company** radio, legal name, P.IVA, public name, venue type Gym, street address, city, website, category chip, terms.
- Public name left empty shows the legal name as placeholder and the hint *The name customers will see. Left empty, the legal name is used.* Typing a public name keeps it.
- Bad P.IVA `12345678901` plus website `javascript:alert(1)` together: two inline `role="alert"` messages (*Invalid VAT number...*, *Enter a full address starting with http:// or https://*; IT: *Partita IVA non valida...*, *Inserisci un indirizzo completo...*), `aria-invalid="true"`, `aria-describedby` pointing at the error, and **focus on the P.IVA field**. A form-level alert *Check the highlighted company details.* appears too (`business-02-signup-vat-error.png`).
- Valid values (`01234567897`, `https://journey-fitness.example.com`, EN; `12345678903`, IT) create the account and go to `/auth/permissions`, then **Skip for now** to the provider portal (`business-03b-pending-dashboard.png`: amber banner *We are verifying the VAT number and company details*). `/profile` shows **Request under review** with the company text (`business-03-pending.png`). Note: the guide said the owner lands on "the existing Request under review screen"; that card is on `/profile`, the post-signup landing is the dashboard. The guide now says so.
- Light theme: `business-01b-signup-company-light.png` (EN).

### 2. Duplicate P.IVA

Second account (`journey.biz.dup...`), legal name *Copycat Gym SRL*, P.IVA typed as `IT 01234567897` (prefix and spaces normalised): inline *This VAT number is already registered* (IT: *Questa partita IVA è già registrata*), `aria-invalid`, `aria-describedby="business-vatNumber-error"`, **`document.activeElement.id === "business-vatNumber"`** after the 409 returns. This confirms the deferred-focus fix. Also reproduced in Italian with the `IT12345678903` form (`business-02b-signup-vat-taken.png`).

### 3. Admin approval

- `/admin/providers` > Filters > Type > **Companies** (URL `?type=business`), no console error, so the four new `users` composite indexes are READY on staging. Company rows carry a **COMPANY** badge (`business-04`).
- Detail page shows the **Company** block: legal name, VAT number, public name, venue type, address, city, website (an anchor with an external-link icon, rendered only for an http(s) URL; `N/A` when empty), and **Release VAT number** (`business-05`).
- **Verify**: `decideProviderApplication` returns 200; after a reload the company shows **Verified**. `/admin/venues` lists *Journey Fitness Torino* (Gym, Via Roma 10, Torino) with Owner `GjMJqDTr...` (uid prefix). IT approval created `biz_EEK8TcGzZ4YAaeBbMLubf2nYPrm1` the same way.

### 4. Search, badge, booking

- Owner edits the draft *Personal Training* service (price 35, active; IT 40) from Services > actions > Edit.
- Customer search for the public name and for the legal name (`Journey Fitness SRL`, `SRL`, and the partial `journey fitness`) all return the company. Card: logo (once uploaded, otherwise initials), name, **VERIFIED** and **COMPANY** badges (IT **VERIFICATO** / **AZIENDA**), price. The whole card is now a link (the old finding about non-link cards is fixed).
- 320 x 700, EN / IT / DE: the two badges stack on two lines, no horizontal overflow (`scrollWidth` 316 <= 320), the name truncates with an ellipsis in German (`business-06b-search-badge-320-*.png`).
- Provider page `/providers/detail?id=...` header: logo, name, VERIFIED, COMPANY (`business-07`); light variant `-light`.
- Booking: Book now > Select > day > time > Continue > Confirm shows *Journey Fitness Torino* (IT *Palestra Journey Milano*) on the confirmation and the booking detail (`business-07c`, `07d`).

### 5. Owner edits

- `/profile/edit` > Professional > **Company details**: legal name, VAT number, venue type and street address are `readOnly`; typing `99` into the VAT field leaves it unchanged. Hint *Verified by an admin: contact support to change it.* is linked by `aria-describedby`.
- Public name, description, city and website saved (*Company details saved* in a `role="status"` region); website `javascript:alert(1)` is rejected inline with focus on the field (`aria-invalid`).
- Logo: `setInputFiles` on `#profile-business-edit-logo` with a 256 x 256 PNG; uploaded to Storage at once (no Save needed), survives reload, appears in search and on the provider page.
- After renaming to *Journey Fitness Torino Centro*, search for `Centro`, `Journey F` and the full name returned the new name within about 2 minutes. The city is not searchable (`Moncalieri` returned no results; not expected to be).

### 6. Gyms & schools

Location saved at `/provider/location` (address search "Piazza Castello 1, Torino" gave 45.071, 7.686 and city Torino; IT "Piazza Gae Aulenti, Milano"; toast *Location saved...*). The venue shows on `/fit/gyms` ("Gyms & schools" / "Palestre e scuole") only in the "Near me" geo query (0.1 km, 25 km radius), and links to `/venue?id=biz_<uid>`; the venue page shows name and address (`business-09`, `09b`).

### 7. Release P.IVA

Detail > **Release VAT number** > dialog (`role="dialog"`, `aria-modal`, title *Release the VAT number?*, repeats the number, extra warning because the company is verified, optional reason; focus starts on the reason textarea) > **Release** > toast *VAT number released*. A second release immediately after: toast *The VAT number was already free*. IT: *P.IVA liberata* / *La P.IVA era già libera*. After the first release, the second (customer) account applied as a company with `01234567897` from `/profile` > Become a professional and succeeded (pending screen with the company text); invalid P.IVA on that form also focuses the field. All three claims were then released again (see cleanup).

### 8. Accessibility spot checks

- **Tab order** (register, company form): Company radio, Legal name, P.IVA, Public name, Venue type, Address, City, Website, Category, service chips, terms, links, Create account. Logical. On `/profile/edit` the company section tabs through legal name (read-only), P.IVA (read-only), public name, description, venue type (read-only), address (read-only), city, website, Save.
- **Announcements**: field errors are `role="alert"`; success messages are in `role="status"` / `aria-live` regions; dialog has `role="dialog"` + `aria-modal`.
- **Targets**: all company-form inputs, selects and the Save button are >= 44 px high (44 x 320, Save 60 high). Smaller: *Back* (61 x 20), *Show* password (32 x 16) and the inline Terms / Privacy / Login links on the auth screens (shared auth page, not company specific).
- **Overflow**: no horizontal overflow at 320 and 390 on register, profile/edit (Professional), provider services, location, dashboard, `/booking`, provider page, `/book`, `/fit/gyms`, venue page. Exceptions: D3 (admin provider detail at 390) and D10 (`/profile` at 320).
- **Light theme `<select>`**: venue type and category selects have the same background (`rgb(234,242,251)`), border (1px `rgb(159,182,207)`, radius 12), text colour and height (44) as the text inputs, at 320 and 390 (`business-01b-signup-company-light.png`).

## Defects and findings (ranked)

| ID | Sev | Where | Finding |
|--|--|--|--|
| D1 | Medium | `/auth/register`, company, `business_vat_taken` | The Firebase account and a customer profile are created **before** `applyAsProvider` runs, so after the inline P.IVA error the user is signed in as a plain customer. Fixing the P.IVA and pressing **Create account** again gives *An account with this email already exists* (console: `auth/email-already-in-use`, `signUp` 400) and no way forward except Log in, then `/profile` > Become a professional. Steps: register as company with a taken P.IVA, change the P.IVA to a free one, submit. Expected: the second submit completes the application. Evidence: dup account `RRLZbsBhO1PYLUxtBqmRj3ZPATq2` is a customer until it applied from `/profile`. |
| D2 | Medium | `/admin/providers?id=<uid>` | After **Verify**, the detail page does not update: it keeps *Pending*, **Reject** and **Verify**, and no toast was seen (waited ~15 s; `decideProviderApplication` returned 200). Only a reload shows *Verified*. A second click on Verify is possible meanwhile. Not tested whether individuals behave the same. |
| D3 | Medium | `/admin/providers?id=<uid>` at 390 | Horizontal overflow: `scrollWidth` 473 vs 390. The tab strip (Overview / Documents / Bookings / Reviews) is not scroll-contained. Shared provider detail page, not company specific. |
| D4 | Medium | `/fit/gyms` | Without a known location the list is the 50 best-rated venues, so a new, unrated company venue is not listed (not found after ~85 s and 6 reloads). It appears with **Near me**. The guide said "listed once it has a position"; the guide now describes this. Product question: should new company venues be discoverable in the default view? |
| D5 | Low | Accessibility | Confirmed the open points from B9: the Individual/Company radiogroup has both radios as tab stops and no arrow-key handling; required company fields have no `required` / `aria-required`; the logo `sr-only` file input is exposed with the same accessible name (*Change logo*) as the visible button, so assistive tech sees two controls. |
| D6 | Low | `/book?providerId=` | The booking page header shows VERIFIED but **no COMPANY badge**; the guide/plan expected the badge on the company's page, which is `/providers/detail` (it has it). |
| D7 | Low | `/auth/register` | The form-level banner *Check the highlighted company details.* stays after the fields are corrected, until the next submit. |
| D8 | Low | `/booking` search | Two-word queries match as a phrase prefix of an indexed term: `Torino Centro` does not find *Journey Fitness Torino Centro* while `Centro` and `Journey F` do. Probably pre-existing search behaviour. |
| D9 | Low | Register | Plural: *1 services selected* / *1 servizi selezionati*. |
| D10 | Low | `/profile` at 320 | 6 px horizontal overflow from the row with the amber text (`text-warning`), `scrollWidth` 326. |
| D11 | Low | Venue | The venue keeps the original name (*Journey Fitness Torino*) after the public name changes to *...Centro*; only location data is synced. Probably intended, worth confirming. |
| D12 | Low | `/admin/providers` | The **Pending applications** cards have no company indicator (the table below has the badge). |
| D13 | Low | Auth screens | Touch targets under 44 px: *Back* 61 x 20, *Show* 32 x 16 (pre-existing). |
| D14 | Low | Booking detail | The company avatar there is initials (*JT*, *PM*) rather than the logo. |
| D15 | Info | `/provider/location` | Input ids are built from the translated label (`indirizzo-o-città`, `città`), so they change per language. Harmless, but fragile for tests. |
| D16 | Info | Staging | A non-allowlisted email gets the raw text *Firebase: HTTP Cloud Function returned an error: {"error":{"message":"staging-access-denied"...}}* on the signup form. Staging only. |

## Accounts, data and cleanup

Passwords for the journey accounts: `JourneyDemo!2026!`. The demo accounts are the seeded ones.

| What | Value |
|--|--|
| EN company owner | `journey.biz.en.202610191930@vitfitdemo.dev`, uid `GjMJqDTrn0Y0KyEMJfApoLIBD6m1`, verified, public name *Journey Fitness Torino Centro*, legal name *Journey Fitness SRL*, venue `biz_GjMJqDTrn0Y0KyEMJfApoLIBD6m1`, service *Personal Training* 35 EUR active, logo, location Torino |
| IT company owner | `journey.biz.it.202610191930@vitfitdemo.dev`, uid `EEK8TcGzZ4YAaeBbMLubf2nYPrm1`, verified, *Palestra Journey Milano Centro* (legal *Palestra Journey Italia SRL*), venue `biz_EEK8TcGzZ4YAaeBbMLubf2nYPrm1`, service 40 EUR active, logo, location Milano |
| Duplicate-test account | `journey.biz.dup.202610191930@vitfitdemo.dev`, uid `RRLZbsBhO1PYLUxtBqmRj3ZPATq2`, company application *Copycat Gym SRL* **pending** (not approved or rejected) |
| Second duplicate-test account | `journey.biz.re.202610191930@vitfitdemo.dev`, plain customer (its company application was refused as a duplicate); uid not recorded |
| P.IVA numbers consumed | `01234567897` (EN company, then the dup account), `12345678903` (IT company). `12345678901` (invalid, never stored) and `50500000000` (never submitted) were not claimed |
| P.IVA claims | **All released** through the admin UI: `01234567897` (EN company, then again from the dup account), `12345678903` (IT company). The companies keep the number they declared in their own records, as designed |
| Staging allowlist | Four entries added at `/admin/staging-access` (note *B10 business verification*) as `admin@vfit.com` (documented staging superadmin): the four `journey.biz.*.202610191930@vitfitdemo.dev` addresses. They were not removed |
| Bookings | `OlMsXEpbxfG0oARUXmEt` (EN) and `EuiQ2NORpUBJ76KqHsyr` (IT) created by `demo.customer` and **cancelled by the customer** |
| Demo account preferences | `demo.customer`: theme set to dark and language to Italian during the run, **restored to light / English**. `demo.admin`: language switched to English and back, ends **Italian** |
| Test companies | Left in place (two verified, one pending, with their venues) |

## Not verified

- Firestore rules against a hand-crafted client write to the frozen fields (only the read-only UI was tried; the rules have their own tests).
- A `javascript:` website cannot reach the admin block (it is refused at input), so the "link only if http(s)" branch was seen only for a valid URL.
- Admin audit-log entries for approve and release (not opened).
- Light theme for every screen: only the signup form, search card, provider page and booking page were captured in light.
- 320 px German/Italian for the provider page and the company form (only the search card).
- Owner column on `/admin/venues` is inside a horizontally scrolling table at 390 px; its text was read from the DOM, not captured in a screenshot.
- Email verification (the staging mail provider is a placeholder).
