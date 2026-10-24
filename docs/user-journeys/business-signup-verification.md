# Business (company) accounts: browser verification (plan task B10)

> **Update 2026-10-20:** the reconciled build was re-verified in the browser on staging: see [`business-reconciled-verification.md`](business-reconciled-verification.md); it supersedes the "by code reading" column below.
>
> **Status banner (added 2026-10-19, reconciliation).** This log was written against **main's rebuild** of business accounts (staging
> build `cf505de`, re-check at `20759f9`), which is **superseded**: the branch `feat/business-accounts` (production-deployed
> 2026-10-06) is the base and main's delta was ported onto `reconcile/business-accounts` (see
> `docs/reports/2026-10-19-business-reconciliation-analysis.md` and the plan log). Screenshot references below point at main's files
> (`screenshots/business-*.png`), which are not in this tree; the branch's guides use `business-screenshots/`. Nothing here has been
> re-run against the reconciled build, which is **not deployed anywhere**; the statuses below come from reading code and tests only,
> so each "resolved" still needs the browser re-check in the staging runbook (`docs/deployment/staging.md`).
>
> | ID | Reconciled branch (by code reading) |
> |--|--|
> | D1 duplicate tax id then fix and resubmit | **Resolved in code**: `RegisterClient.tsx` keeps the created account (`createdAccount`) and re-sends only the application on retry; account fields are locked meanwhile (the cosmetic double message may remain) |
> | D2 admin page not refreshed after Verify | **Resolved in code**: branch commit `b465288` (refresh after approval/rejection in `ProviderDetailView`, with a test) |
> | D3 admin detail overflow (tab strip, long email) | **Resolved in code** by R6 `e41e796` (`EntityDetailLayout` wrapping, scrolling tab strip with focus-ring padding); re-check at 320/390 |
> | D4 `/fit/gyms` top-50 without location | **Closed 2026-10-24** (cursor pagination, 24 per page, `fetchTopRatedVenuesPage`) |
> | D5 a11y of the type toggle and required fields | **Resolved in code**: native radio group in `ProviderTypeChoice.tsx`, `aria-required` on required company fields, logo file input is `hidden` (not exposed) |
> | D6 Company badge on `/book` | **Resolved in code** by R8 `1abdfb2` |
> | D7 stale form-level banner | **Not applicable in code**: the branch's company form has no form-level "Check the highlighted company details" banner; re-check |
> | D8 multi-word search | **Open** (not re-tested) |
> | D9 plural "1 services selected" | **Open** (`provider.optIn.selectedCount`) |
> | D10 `/profile` 6 px overflow at 320 | **Open**, not re-checked |
> | D11 venue follows the public name | **Resolved in code** by R4/R4b: `syncBusinessVenueLocation` mirrors `business.displayName` to the venue `name` (slug unchanged) |
> | D12 pending-applications cards without company indicator | **Resolved in code**: `ProviderApplicationsPanel.tsx` renders `BusinessBadge` |
> | D13 auth touch targets < 44 px | **Open** (pre-existing, shared) |
> | D14 booking detail logo / badge | **Resolved in code** by R8 (logo and badge from the provider profile); the badge disappears when the profile is unreadable (open follow-up) |
> | D15 `/provider/location` ids from translated labels | **Open**, not re-checked |
> | D16 raw `staging-access-denied` text on signup | **Open**, not re-checked (sign-in path maps it in `authStore.ts`) |


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

## Re-verification (20759f9)

| | |
|--|--|
| **Date** | 19 October 2026 |
| **Environment** | Staging only (`https://vfit-app-staging.web.app`, project `vfit-app-staging`); production was not touched. Hosting and `syncBusinessVenueLocation` had just been redeployed at commit `20759f9` (the deployed build was not otherwise checked against the SHA) |
| **Device** | Chromium via Playwright, 390 x 844, dark (320 x 844 for the overflow check). One fresh private browser context per actor (company A owner, company B owner, `demo.customer`), admin in the main context |
| **Screenshots** | `screenshots/business-recheck-*.png` |

Application code was not changed.

### Result per item

| Item | Result | Evidence |
|--|--|--|
| D1 duplicate P.IVA, then fix and resubmit | **PASS** | See below |
| D2 admin approve updates the page without a reload | **PASS** | See below |
| D3 no horizontal overflow on the admin provider detail | **FAIL** (tab strip fixed; the long email in the header still overflows) | See below |
| D11 venue follows the public name | **PASS** (slug not visible in the UI, not checked) | See below |
| D6 Company badge on `/book` | **PASS** | See below |
| D14 company logo and badge on the booking detail | **PASS, with a caveat** (badge always; logo after a reload, initials right after confirming) | See below |
| D5 toggle keys | **PASS** | See below |

Console and network: no `permission-denied`, no missing-index errors, no failed Firestore requests at any step. The only failures were the expected `applyAsProvider` 409 `business_vat_taken` (company B, once) and one transient `ERR_HTTP2_PROTOCOL_ERROR` on a Firestore `Listen` channel in the admin tab while navigating away.

### D1: duplicate P.IVA, fix, resubmit (PASS)

- Company A (`journey.biz.recheck.a.202610192224@vitfitdemo.dev`, legal name *Recheck Gym A SRL*, P.IVA `01234567897`) registered and landed on `/auth/permissions`, then *Skip for now* to the provider dashboard (`business-recheck-00-form-a.png`, `-01-company-a-pending.png`).
- In a second fresh context, company B (`journey.biz.recheck.b.202610192224@vitfitdemo.dev`, *Recheck Gym B SRL*) with the same P.IVA: `applyAsProvider` returned 409 `business_vat_taken`. The page showed the inline alert *This VAT number is already registered* under the field, `aria-invalid="true"`, `aria-describedby="business-vatNumber-error"`, **`document.activeElement.id === "business-vatNumber"`**, the hint *Account created. Fix the professional details and try again.* at the top, and the email and both password inputs are `disabled` (`-02-company-b-vat-taken.png`, `-02b-company-b-hint-top.png`).
- Changing the P.IVA to `12345678903` and pressing **Create account** again: **no `signUp` call, no "email already exists"**, no failed request; it went to `/auth/permissions`, then the dashboard. `/profile` shows **Request under review** with *We are verifying the VAT number and company details...* (`-03-company-b-pending.png`).
- Cosmetic: the *This VAT number is already registered* message appears twice at the top of the form (the form-level banner plus the field error under the field).

### D2: admin approve (PASS)

`/admin/providers?type=business` (the Companies filter, chip *Type: Companies*), company A row, detail page `?id=x473tgl2PZanNCUgd6YM6QvYuKC2`. Pressing **Verify**: the header badge changed from *Pending* to *Verified* about 4 s after the click (measured by polling, includes the function round trip), **without a reload**; the Reject and Verify buttons were removed; **one** toast *Provider verified successfully.* (counted with a MutationObserver on the toast region; 3 s extra wait, no second toast); no failed requests (`business-recheck-04-admin-approved-no-reload.png`). The reject path was not run. A venue `biz_x473tgl2PZanNCUgd6YM6QvYuKC2` ("Recheck Gym A", Gym, Via Roma 10, Torino, owner `x473tgl2...`) appeared in `/admin/venues`.

### D3: admin detail overflow (FAIL, root cause narrowed)

`document.documentElement.scrollWidth <= window.innerWidth` on `/admin/providers?id=x473tgl2PZanNCUgd6YM6QvYuKC2` (after Verify, also after a reload at each width):

| Width | scrollWidth | innerWidth | Result |
|--|--|--|--|
| 390 | **418** | 390 | FAIL |
| 320 | **418** | 320 | FAIL |

- The previous defect is fixed: the tab strip (Overview / Documents / Bookings / Reviews) is now inside a `min-w-0 max-w-full overflow-x-auto` wrapper (it scrolls internally; it was 473 before).
- The remaining overflow comes from the header paragraph under the name (`P.mt-1.text-content-muted`): the unbreakable address `journey.biz.recheck.a.202610192224@vitfitdemo.dev` is 402 px wide in a 354 px (390) or 284 px (320) box. Replacing only that text with `short@x.dev` in the DOM brings `scrollWidth` to 386 (390) and 316 (320), so the page then fits.
- Control with a normal-length address, `/admin/providers?id=demo-provider-vfit` (`demo.provider@vitfitdemo.dev`, 28 characters): `scrollWidth` 386 at 390 and 316 at 320 (**PASS**, `business-recheck-05b-admin-detail-short-email-390.png`).
- Screenshots of the failing page: `business-recheck-05-admin-detail-390.png`, `-320.png`.
- Defect D3b (Low/Medium): addresses longer than about 36 characters (at 390) or 29 (at 320) overflow the header on the shared admin provider detail page; it needs `break-all` / `truncate` / `min-w-0` on the email line. The same is likely on other admin detail pages that print the address unwrapped (not checked).

### D11: venue follows the public name, and booking badges (PASS)

- Owner A, `/profile/edit` > Professional > Company details: public name *Recheck Gym A* changed to *Recheck Gym A Renamed*. Note that the sticky **Save changes** button did not save it (no feedback); the section's own **Save company details** did (*Company details saved*, 20:30:59 UTC).
- `/admin/venues` (reloaded) showed *Recheck Gym A Renamed* for the venue `biz_x473tgl2PZanNCUgd6YM6QvYuKC2` on the first check, about 9 s after saving; the venue id and the URL `?id=biz_<uid>` are unchanged, and there is no second venue (`business-recheck-07-admin-venue-renamed.png`). The venue slug is not shown anywhere in the admin venue form, so it was not compared.
- Search as `demo.customer` for *Recheck Gym A Renamed* returned the company with the new name, VERIFIED and COMPANY badges and *From 35.00* (`-08-search-result.png`).
- D6: `/book?providerId=x473tgl2PZanNCUgd6YM6QvYuKC2` header shows **VERIFIED** and **COMPANY** (`-09-book-company-badge.png`).
- D14: after the owner uploaded a logo (256 x 256 PNG, `#profile-business-edit-logo`; `Personal Training` edited to 35 EUR and activated), `demo.customer` booked it (Thu 22 Oct, 11:00): the confirmation page shows the logo. The booking detail (`/bookings/detail?id=q4LcKNgMcjLZxMaQcou7`) shows the **Company** badge and the **logo** (`business-recheck-11-booking-detail.png`, in the customer's light theme). Caveat: on the first render right after confirming (`...&confirmed=true`, client navigation) the avatar showed the initials *RR* and no `<img>`; a reload showed the logo. Observed once, not retried (Low).
- The booking was **cancelled by the customer** (status *Cancelled by client*).

### D5: signup toggle keys (PASS)

`/auth/register?as=provider`, Individual/Company radiogroup: roving tabindex is in place (selected radio `tabindex=0`, the other `-1`). ArrowRight moved the selection and focus Individual to Company, ArrowLeft back to Individual. A synthetic `keydown` with `altKey: true` (ArrowLeft and ArrowRight, `bubbles`, `cancelable`) was **not** prevented (`defaultPrevented === false`) and did not change the selection; the same event without Alt was prevented (`true`).

### Accounts, data and cleanup

| What | Value |
|--|--|
| Company A | `journey.biz.recheck.a.202610192224@vitfitdemo.dev`, uid `x473tgl2PZanNCUgd6YM6QvYuKC2`, verified, *Recheck Gym A Renamed* (legal *Recheck Gym A SRL*), venue `biz_x473tgl2PZanNCUgd6YM6QvYuKC2`, *Personal Training* 35 EUR active, logo uploaded |
| Company B | `journey.biz.recheck.b.202610192224@vitfitdemo.dev`, uid `DcUGtqHiUjaBxYBUN9ifeivbA502`, application *Recheck Gym B SRL* **pending** (not approved or rejected) |
| P.IVA | `01234567897` (A; B's refused attempt never claimed it) and `12345678903` (B). **Both released** through the admin *Release VAT number* button (toast *VAT number released* each). `50500000000` was not used |
| Staging allowlist | The two `journey.biz.recheck.*.202610192224@vitfitdemo.dev` addresses were added at `/admin/staging-access` as `admin@vfit.com` (note *B10 recheck 20759f9*); not removed |
| Booking | `q4LcKNgMcjLZxMaQcou7` by `demo.customer`, cancelled by the customer |
| Demo accounts | `demo.admin` / `demo.customer` data unchanged apart from the cancelled booking. The staging admin session used `admin@vfit.com` for the allowlist only, and switched its UI language to English (it was Italian) |
| Test companies | Left in place (A verified with its venue, B pending) |
