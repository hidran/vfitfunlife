# Business accounts: browser verification of the reconciled release

| | |
|--|--|
| **Date** | 20 October 2026 (about 02:50 to 03:50 local) |
| **Environment** | Staging only: `https://vfit-app-staging.web.app`, backend `vfit-app-staging`. Production was not touched |
| **Deployed code** | `f3abc70` (main is at `a545614`, docs only) |
| **Device** | Chromium via Playwright, 390 x 844 (dark; light where colours matter), 320 spot checks, English and Italian (German for the badge check) |
| **Actors** | One cleared browser profile per actor (localStorage, IndexedDB, cookies cleared between logins): superadmin `admin@vfit.com`, `demo.admin`, `demo.customer`, the fresh company owners below |
| **Application code** | Not changed. Read-only extras: two callable requests with an owner's own ID token (steps 6 and 7), one Firestore REST read of the owner's own `instructors` document, and reads of the service worker cache (defect D1) |

Supersedes the "by code reading" column in the banner of [business-signup-verification.md](business-signup-verification.md) (defects D1 to D16 of the main-era run are re-checked below). Screenshots: [business-screenshots/README.md](business-screenshots/README.md) (section "Reconciled build re-shoot"), referenced from [business-signup.md](business-signup.md) and [business-signup.it.md](business-signup.it.md).

## Result per step

| # | Step | Result | Evidence |
|--|--|--|--|
| 1 | Company signup, errors with focus, duplicate tax id, kill switch | **PASS** | See 1 below |
| 2 | Admin filter, review card with venue type and address, approval, venue created, Owner link | **PASS** (note N1) | See 2 |
| 3 | Public search, badges and logo, `/providers/detail`, `/book`, confirm page, booking detail, cancel | **PASS** (notes N2, N3) | See 3 |
| 4 | Owner edits, legal fields read-only, venue follows the name, location puts the venue in `/fit/gyms`, venue page | **PASS** (logo caveat: user error on my side first, then PASS) | See 4 |
| 5 | Social links: placeholder-style values normalised, `javascript:` refused | **PASS on the Personal tab; FAIL (D2) on the Professional-tab form** | See 5 |
| 6 | Admin tools: tax id correction, convert to individual, claim release | **PASS** (D3, D6) | See 6 |
| 7 | Reject path, re-apply, `provider_type_locked` | **PASS** (UI limits N4, D3) | See 7 |
| 8 | A11y/layout spot checks | **PASS with findings** (D4, D5, D8) | See 8 |
| 9 | Cleanup through the admin UI, cascade check, claim re-use | **PASS** | See 9 |

Console and network at every step: **no `permission-denied`, no missing-index error, no failed Firestore request, no function error other than the deliberate negative tests** (`applyAsProvider` 409 `vat_already_registered` once, `updateBusinessTaxId` 409 once, `releaseBusinessVat` 404 `claim_not_found` once, `applyAsProvider` 400 `provider_type_locked` twice from my direct calls, `identitytoolkit signUp` 400 `staging-access-denied` once when I registered before the allowlist entry had landed). The only recurring console error is `Unexpected token '<'` on every page load in this browser profile (135 times): see D1. `[notifications] inbox listener failed: Firestore shutting down` appears on every session switch (harmless, same as the main-era run).

## Accounts, tax ids

Password for all journey accounts: `JourneyDemo!2026!`. Tax ids are fresh, valid (Luhn-style check digit) and were not used by the leftovers.

| Role | Email | uid | Tax id | Notes |
|--|--|--|--|--|
| Company A (gym) | `journey.rc.gym.202610200251@vitfitdemo.dev` | `SXvk8jUgQaQ7ESPY6wT5OdnnJZA3` | `02345678904` (SRL) | Legal "RC Palestra Journey SRL", public "RC Gym Journey", later "RC Gym Journey Centro"; venue type Gym, Via Roma 10, Torino; approved; priced service 35 EUR |
| Company B (no premises) | `journey.rc.dup.202610200251@vitfitdemo.dev` | `yAXZdaedJKScNquSpjc0MwTmm033` | first `02345678904` (refused as duplicate), then `03456789019` | Venue type "No fixed premises"; rejected twice, claim released |
| Association C | `journey.rc.assoc.202610200251@vitfitdemo.dev` | `C6xyJyegPHRKaPCM3U5AfYw9ArW2` | `04567890126` (codice fiscale, legal form Association), corrected to `05678901231` | School at Corso Vittorio 5, Torino; approved; converted to individual |
| Individual | `journey.rc.ind.202610200251@vitfitdemo.dev` | `YEYsfWXzAjdXij0mAiFNQnYsSel2` | none | auto-approved at signup |
| Claim re-use check | `journey.rc.claim.202610200251@vitfitdemo.dev` | `NPxnrxyrczgm5i9E6BItU9aIrkF2` | `02345678904`, then corrected to `05678901231`, `04567890126`, `06789012348` | proves all freed claims are re-usable |
| Screenshot re-shoot | `journey.rc.shot.202610200251@vitfitdemo.dev` | `HL1FqPnOUlMeN9v5TsFB658SJ202` | `02345678904` | "RC Shot Gym", approved, location saved, used for the `/fit/gyms` shots |

Other tax ids: `12345678901` (invalid checksum, refused inline), `06789012348` (only used in a refused `provider_type_locked` call and in the last correction above). Booking `0FwjGlCZ02h2evICeCrU` (demo.customer, RC Gym Journey, Fri 23 Oct 11:00, 35 EUR, pay-direct) was created and **cancelled by the customer**; no payment.

## Step details

### 1. Company signup

- `/auth/register/?as=provider`, 390 dark (later 320 and 390 light, IT, DE). Company radio group is a native radio pair: arrow keys move the selection (checked state flipped from Individual to Company with ArrowRight), both radios are tab stops 0 (browser roving behaviour).
- Fields in the form: legal name, P.IVA / codice fiscale, legal form (Company, Sole trader, Association / club, Other), affiliation number, public name, **venue type (Gym default, School, Studio, No fixed premises)**, street address and city (shown only for a venue type; hidden for "No fixed premises"), website, description, category and services, terms.
- Gym with address and city empty, invalid P.IVA `12345678901`, website `javascript:alert(1)`: inline errors (`aria-invalid`, `aria-describedby`) on **P.IVA ("Invalid P.IVA or codice fiscale: check the 11 digits."), address ("The street address is required for a venue"), city ("The city is required for a venue") and website ("Invalid website address. Example: www.yoursite.com")**; focus lands on the P.IVA field; services alert "Tap at least one specific service". Same at 320 in Italian and German, focus on `vatNumber`, no horizontal overflow, all inputs and selects 52 px high. Light theme: selects and inputs share the same background and border (`it-signup-venue-errors-390-light.png`).
- Valid values (`02345678904`, `https://rc-journey.example.com`, Gym, Via Roma 10, Torino, Personal Training): account created, `/auth/permissions`, then the provider dashboard with the banner "Profile under review: we are checking the P.IVA / codice fiscale; you will be visible after approval."
- **Duplicate tax id** from B (`IT 02345678904`, prefix and spaces normalised): inline "This P.IVA / codice fiscale is already registered by another account. If it is your business, contact support." (`vat_already_registered`), `aria-invalid`, **focus on `vatNumber`**. Fixing the number to `03456789019` on the same form and pressing Create account again succeeded with the account fields locked and no "email already exists" (main-era D1 resolved).
- Association with legal form "Association / club", codice fiscale `04567890126`, affiliation `CONI-RC-12345`, venue type School: accepted.
- **Kill switch**: individual signup (`journey.rc.ind`) was auto-approved on the spot (dashboard "You're bookable Mon-Fri 9:00-17:00", `autoApprove` ON in the admin settings card); companies stayed pending. The setting itself was not toggled.

### 2. Admin review and approval

- `/admin/providers/?type=business` (filter chip "Account type: Companies and associations"): the three companies are listed with the AZIENDA badge; the Pending applications panel cards also carry the badge (D12 resolved) and legal name, tax id, legal form and affiliation.
- Detail (`/admin/providers/?id=SXvk8j...`) review card: legal name, P.IVA, legal form, affiliation, public name, city, **Tipo di sede: Palestra, Indirizzo: Via Roma 10, Sede: "Creata all'approvazione"**, website (anchor), description (`it-admin-review-venue-390-dark.png`). **Verifica** approved it in place, no reload (status "Verificato", D2 resolved); the same for C.
- `/admin/venues`: new row **"RC Gym Journey", Gym, Via Roma 10, Torino, Partner column "Standard", Owner `SXvk8jUg...`, Stato "Attivo"**; detail form: `type=gym`, `isActive=true`, `partnerStatus=pending`, `ownerId=<owner uid>`. C's venue: type school. The Owner link opens the owner in `/admin/providers/?id=...` (works). After approval the review card's "Sede" shows "Apri sede" (link to the venue).
- N1: the venue is **active** immediately, not inactive; it is only invisible in `/fit/gyms` until coordinates exist (step 4). Its partner state is `pending` ("Standard" in the list).
- Not tried: the "Not specified" legacy handling.

### 3. Public

- `/booking` (EN, light): search "RC Gym Journey" and "RC Palestra Journey SRL" (legal name) both return the company card (initials, later the logo) with **BUSINESS** and **VERIFIED** badges, "From 35.00 EUR". (English badge text is "Business"; Italian "AZIENDA"; German "UNTERNEHMEN".)
- **320 px, IT and DE** (customer language switched through the UI and restored): the logo, the name (truncated with an ellipsis), the two badges **stacked on two lines**, price and "Check availability"; `scrollWidth` 316 for 320 (scrollbar), no overflow (`it-search-logo-badges-320-light.png`, `de-search-logo-badges-320-light.png`).
- `/providers/detail/?id=...`: header with logo (after the logo upload), name, BUSINESS, VERIFIED, description, website. `/book/?providerId=...`: header and avatar with logo, BUSINESS + VERIFIED (main-era D6 resolved). `/booking/confirm`: "RC Gym Journey" with BUSINESS badge. Booking detail `bookings/detail/?id=0Fwj...`: logo, name, BUSINESS badge (`en-booking-detail-logo-390-light.png`, D14 resolved).
- Owner first set the service price to 35 and activated it (Services > Service actions > Edit); customer chose Fri 23 Oct 11:00, accepted terms, confirmed; status "Awaiting confirmation"; then **Cancel booking** (status "Cancelled by client").
- N2: the booking detail keeps the company name as it was at booking time ("RC Gym Journey") although the public name later became "RC Gym Journey Centro"; the logo and badge come from the live profile. Probably intended (booking snapshot).
- N3: the customer was in light theme for this step (its saved preference); dark was checked on the admin, owner and venue pages only.

### 4. Owner

- `/profile/edit/` > Professional > **Business details**: legal name, P.IVA, legal form, affiliation, venue type and street address are **plain text, not inputs** ("These were verified by our team. To change them, contact support."). Editable: public name, city, website, description, logo (button "Upload logo", `data-testid="business-logo-input"`). Saved "RC Gym Journey Centro", city Moncalieri, `https://rc-journey.example.org`, a description: "Business details saved." The saved `instructors` map (read through the owner's own token) contains the legal fields unchanged, `venueType`, `address` and `venueId: biz_<uid>`.
- Logo: my first upload went to the profile avatar input by mistake (user error); after using the logo input and Save, the logo appears on `/providers/detail`, `/book`, search and booking detail.
- **Venue follows the public name**: `/admin/venues/?id=biz_SXvk...` showed name "RC Gym Journey Centro" within the first minutes (slug and venue city unchanged: the venue keeps its own city Torino).
- Location: `/provider/location/`, "Piazza Castello 1, Torino" gave 45.071, 7.686, city Torino; "Location saved: you now show up in near me searches." The venue then appears in **`/fit/gyms` ("Gyms & schools" / "Palestre e scuole") after "Near me"** (0.0 km), and not in the default list (D4 stays open). Venue page `/venue/?id=biz_...` shows name and address. Re-shot on a fresh "RC Shot Gym" with the card in view: `en-gyms-near-me-venue-390-{light,dark}.png`, `it-gyms-near-me-venue-390-{light,dark}.png`, `it-venue-page-390-dark.png`, `en-venue-page-390-light.png`.

### 5. Social links

- Personal tab (the editor that R9a-1 changed): website `yourwebsite.com` and LinkedIn `linkedin.com/in/test` saved with **no permission-denied** and were stored as `https://yourwebsite.com/` and `https://linkedin.com/in/test` (visible after reload). `javascript:alert(1)` in website: inline "Invalid website format" and **nothing written** (the stored value stayed `https://yourwebsite.com/`). Focus stays on the Save button and the field has no `aria-invalid` (D5).
- Professional tab (the separate `SocialLinksForm`, ids `social-*`, placeholders `https://...`): the same placeholder-style values are **refused** ("Invalid LinkedIn URL", "Invalid website URL"). D2.

### 6. Admin tools

- **Tax id correction** (C, "Modifica P.IVA e dati legali" dialog with tax id, legal name, legal form, affiliation, reason): `12345678901` refused inline with focus on the field; `02345678904` (claimed by A) refused inline ("...already registered by another account. If that company was rejected, release its P.IVA from its page first."), but focus does not return to the field (D6); `05678901231` saved, the card shows the new number and status unchanged.
- **Convert to individual** (C): dialog "Convert to individual professional? Company data and the P.IVA reservation are deleted and the public name goes back to the person's. Verification status does not change." Confirmed: the company block disappeared, status stayed "Verificato", **venue `biz_C6xy...` became inactive ("Sospeso")** and left `/fit/gyms` after "Near me" while A's and the others stayed (`it-admin-venue-deactivated-390-dark.png`). The owner's profile editor has no Business section any more.
- **Converted account cannot self-apply as a company**: `applyAsProvider` with `providerType: business` for C returns `FAILED_PRECONDITION provider_type_locked`; client message `provider.applyError.typeLocked`: "The professional account type can no longer be changed. Contact support." (IT "Il tipo di account professionale non può più essere cambiato. Contatta il supporto."). The call had to be made directly: no screen of the app offers it (see N4). There is no admin action to turn an individual back into a company.
- **Release claim**: on the rejected company B, "Libera la P.IVA" > dialog "Release the P.IVA? ... 03456789019 will become available..." > Release; a second release answers "No account has registered this P.IVA: there is nothing to release." (console 404 `claim_not_found`). The button is not offered for a verified or pending company (a live company's claim cannot be released from the UI).

### 7. Reject path

- B (venue type none) rejected from the detail ("Rifiuta" > reason > "Conferma rifiuto"): it leaves the pending queue and the list shows **"Rifiutato"**. No venue exists for a company with no premises (and a rejected company never had one). Detail header defect: D3.
- Owner B logged in: `/profile` shows "Request not approved. Contact support for more information." and **no re-apply control**. Re-applying through the callable with the same company data answered `autoApproved: false` (pending again although `autoApprove` is ON; a company is never auto-approved); B returned to the pending list, was rejected again and its claim released (step 6).
- **Verified individual applying as a company** (`journey.rc.ind`, direct callable): `provider_type_locked` (same code as step 6). The Become-a-professional card is not shown to a provider, so the app has no screen for it.
- N4: a rejected account has no self-service way back in the UI; the only paths are the callable and an admin conversion.

### 8. Accessibility and layout

- No horizontal overflow (`scrollWidth` equals viewport minus the scrollbar) at 320 and 390 on: signup (IT/DE/EN, with errors), admin providers list, admin provider detail (A and the long-email `journey.biz.recheck.a...` account), `/profile/edit` Personal and Professional, provider dashboard, location, services. The admin detail tab strip is a scroll container (`overflow-x: auto`, 284 px visible of 517) and a focused last tab scrolls into view: main-era D3 resolved.
- Company form inputs and selects 52 px; buttons 48 px. Under 44 px (not company-specific, shared): `/profile/edit` tabs "Personal"/"Professional" 36 px, Back 40, the email-verification banner buttons 40, language chips 32 (D8).
- Focus lands on the first invalid field after a client error and after the server's duplicate-tax-id error (signup, 390 and 320). The Individual/Company radio group works with the arrow keys.
- Light theme: the colours of selects and inputs match (rgb(234,242,251) background, rgb(159,182,207) border), errors readable.

### 9. Cleanup

- Deleted through **Admin > Users > Delete** as the superadmin (the admin role has no Delete button): leftover `EEK8TcGz...`, `GjMJqDTr...`, `x473tgl2...`, `DcUGtqHi...`, `RRLZbsBh...`; and my accounts A, B, C, individual, the claim account and the shot account. All answered with a redirect to the list; the user pages say "User not found".
- **Venues**: `biz_EEK8...`, `biz_GjMJ...`, `biz_x473...`, `biz_SXvk...` (A), `biz_C6xy...` (C) and `biz_HL1F...` (shot) all `isActive=false` after the deletion (the documents remain, inactive).
- **Tax-id claims gone**: a fresh company registered with `02345678904` (A's claim) after A's deletion; its tax id was then corrected to `05678901231` (C's corrected number), `04567890126` (C's original) and `06789012348`, all accepted. B's `03456789019` was released by hand.
- Staging allowlist: my six entries were added and **removed again** (the list is back to 27 entries; the older `journey.biz.*` entries of the main-era runs were left).
- Not removed: `journey.biz.re.202610191930@vitfitdemo.dev` (a plain customer from the earlier run, not in the five), the other `journey.*` demo accounts, and the four stray `providerType` indexes (separate step). The cancelled booking `0FwjGlCZ02h2evICeCrU` remains (its provider no longer exists).
- Preferences: `demo.customer` English / light, `demo.admin` Italian / dark, both checked after the run (the customer's language was switched to German and Italian for the 320 checks and set back to English).

## Defects and findings (ranked)

| ID | Sev | Where | Steps, expected, actual |
|--|--|--|--|
| D1 | Medium | Service worker `sw.js` (`vfit-runtime` cache), every page | **Steps**: open any page in the test profile; console shows `Unexpected token '<'` once per load (135 times). **Expected**: no error. **Actual**: `/_next/static/chunks/6b173bd88d02c178.js` is served to the browser as `text/html` (50 956 bytes, the app shell) while `curl` and Playwright's HTTP client get the real JavaScript (21 675 bytes, `text/javascript`, same URL). The `vfit-runtime` cache contains an HTML response for that URL (`caches.match` returns `text/html`), and `sw.js` serves `/_next/static/*` cache-first without checking the response type, so one HTML fallback stored during a deploy window (or a stale session) is returned forever. A user who loaded the app while a chunk was missing would be stuck with the broken chunk until the cache is cleared. The chunk's feature was not identified; no visible breakage. Not reproducible outside the service worker. Suggested: cache only `response.ok` with a JavaScript/CSS/font content type, and version the runtime cache like the shell cache |
| D2 | Medium | `/profile/edit` > Professional > social links (`SocialLinksForm`) | **Steps**: type `yourwebsite.com` and `linkedin.com/in/test`, Save. **Expected**: stored normalised like the Personal tab does. **Actual**: "Invalid website URL" / "Invalid LinkedIn URL", nothing saved; two editors for the same `socialLinks` with different rules (the form requires a full https URL; the Personal tab accepts bare hosts and `@handles`). The Professional form's placeholders (`https://...`) differ from the Personal tab's (`yourwebsite.com`) |
| D3 | Medium | `/admin/providers/?id=<uid>`, rejected company | **Steps**: reject a pending company, reload the detail. **Expected**: status "Rifiutato" (the list says so) and no Verifica/Rifiuta. **Actual**: header still shows "In attesa" (pending) with Rifiuta and Verifica; only "Libera la P.IVA" appears. Approving it from there would work (not tried) |
| D4 | Medium (product) | `/fit/gyms` | A new company venue is not in the default list (top rated 50) and appears only after "Near me" (open since the main-era run). Also the page copy says "partner fitness clubs" although the venue is `partnerStatus: pending` |
| D5 | Low | Personal tab social fields | Inline error text appears but the input has no `aria-invalid` and focus is not moved to it (stays on Save changes) |
| D6 | Low | Admin "Modifica P.IVA e dati legali" dialog | The "already registered" server error does not move focus to the tax-id field (the checksum error does) |
| D7 | Low | `/auth/register` | A non-allowlisted email still gets the raw text `Firebase: HTTP Cloud Function returned an error: {"error":{"message":"staging-access-denied"...}}` (staging only; main-era D16, open). I met it once by registering before the allowlist entry had landed |
| D8 | Low | Shared UI | Targets under 44 px: profile edit tabs 36, Back 40, banner buttons 40, language chips 32; auth Back 20 and Show 16 (main-era D13 open, not re-measured on the auth screens) |
| N1 | Info | Approval | The venue is created active, `partnerStatus: pending`; it is not "inactive pending partner" as one might expect |
| N2 | Info | Booking detail | Company name is the booking-time name, logo and badge are live |
| N3 | Info | Theme | Customer-side steps ran in the customer's light preference |
| N4 | Info | Provider-type locks | No screen exists for the `provider_type_locked` and rejected-company re-apply cases (BecomeProviderCard is only for non-providers, a rejected account sees "contact support"); there is no admin "convert individual to company" action |
| N5 | Info | Detail card | "Sede: Creata all'approvazione" is shown before approval and "Apri sede" after, correctly |

Main-era defects re-checked: D1 duplicate-then-fix resolved; D2 refresh after Verify resolved; D3 admin overflow resolved; D4 open; D5 a11y (native radios, `aria-required`, hidden logo input) resolved; D6 `/book` badge resolved; D7 stale form banner not applicable (no such banner); D8 multi-word search, D9 plural "1 services selected", D10 `/profile` overflow at 320 and D15 location ids were **not re-checked**; D11 venue name follows resolved; D12 pending cards badge resolved; D13 open; D14 logo/badge in booking detail resolved; D16 open (D7 above).

## Not verified

- A hand-crafted client write to the frozen business keys (rules tests cover it).
- Reactivation of a venue on re-approval and a venue an admin switched off by hand (no `deactivatedBy` marker check): I approved only once per company, and rejected only a company without premises. Reject-after-approval of a gym company was covered through conversion and deletion, not through "Rifiuta".
- `stale_review` (an owner edit between opening the admin card and approving).
- Customer-side dark theme, and the 320 German/Italian badge check on `/providers/detail` and `/book` (only the search card).
- `/profile` at 320 (main-era D10), multi-word search, plural of "services selected".
- Releasing the claim of a verified company directly (no UI for it), and the "Not specified" legacy handling.
- The courses smoke scripts and the stray-index deletion (separate steps).
- What the chunk in D1 contains and whether real users are affected.
