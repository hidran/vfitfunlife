# Unified group courses: staging browser verification (plan task K2)

- **Date:** 2026-10-20. **Site:** https://vfit-app-staging.web.app (project `vfit-app-staging`; production was never used).
- **Build under test:** hosting deployed from `1dd1261` (`out/sw.js` is byte-identical to the deployed `/sw.js`); backend from the F5/K1 deploys. Repo HEAD at the start: `d63ac02`.
- **Method:** Playwright MCP, 390x844 (320 and 1280 spot checks), dark and light, Italian and English (German at 320 only), one fresh private state per actor (cookies, service worker, Cache Storage, IndexedDB and localStorage wiped between actors). Fixture: `smoke_unified_venue` kept by `scripts/smoke-unified-courses-staging.mjs --keep` (course A with 3 lessons on 27-29 Oct 18:00 Europe/Rome, instructor B partner-discounted 10% + 5%, series 40,00, lesson 15,00; Free; C; unlinked D). Admin SDK helpers (ADC, hard-asserted to `vfit-app-staging`, deleted afterwards) were used only to set up or restore state, listed under "State changes".
- Screenshots: `docs/user-journeys/screenshots/` (English) and `docs/user-journeys/screenshots-it/` (Italian), named `courses-NN-<slug>.png`. The suffix says the theme. Where a step ran in the other language the language is in the folder only, not the file name.

## Verdict per scenario

| | Scenario | Verdict | One-line reason |
|---|---|---|---|
| A | Visitor | **FAIL** | A signed-out visitor cannot reach the venue page, the course list or the "public" timetable: every `(main)` route redirects to `/auth/login` (D1). The other A checks pass for a signed-in user. |
| B | Customer | **PASS with defects** | Pricing, review, `price_changed`, series, free lesson, waitlist, promotion, deadline refusal all correct. Light theme review sheet is unreadable (D2), cancel/leave buttons are labelled "Confirm booking" (D4). |
| C | Individual provider (unlinked) | **PASS with one defect** | Whole flow works, nothing venue-related is forced. "Substitute instructor" is a dead end on an unlinked course (D6). |
| D | Venue staff and owner | **PASS** | Every listed check passes, including overlap errors, capacity-raise promotion, late-cancellation signal and no-show counters (produced by real actions, not seeded). |
| E | Admin | **PASS** | Spaces panel, instructor panel, partner status and both discount fields, Owner column. |
| F | Hosting and service worker | **PASS** | Poisoned HTML-under-JS entries are evicted and the app recovers; `/_next/static/chunks/nonexistent.js` is a 404 and is not cached; routes serve the shell. |
| G | Accessibility and layout | **PARTIAL** | Keyboard, focus and no-overflow pass; contrast fails in light theme (D2, D3); some targets are under 44 px (D8); German title overflows at 320 (D7). |

## Evidence per scenario

### A. Visitor

| Check | Result | Evidence |
|---|---|---|
| `/fit/gyms` ("Palestre e scuole" / "Gyms & schools") lists the fixture venue | **PASS with caveat (D5)** | The default list is the top 50 venues by rating; the fixture has rating 0 and is absent (search "Smoke" finds nothing, screenshot `screenshots-it/courses-01`). With "Vicino a me" (geolocation Torino) it is the first card, badge "Partner", 0,0 km (`screenshots-it/courses-02`). |
| Venue page shows Next lessons and Full timetable | **PASS** (signed-in) | `screenshots-it/courses-03`: "Prossime lezioni" with three lessons, "Orario completo" and "Palinsesto palestra" both link to `/fit/gyms/timetable/?id=smoke_unified_venue`. |
| Public weekly timetable: day tabs on mobile, grid at 1280 | **PASS** (signed-in) | Mobile day tabs `screenshots-it/courses-05`; desktop 1280 seven-column grid `screenshots-it/courses-64`; no horizontal overflow (1276/1276). |
| Visitors see regular prices; Book leads to a login prompt | **FAIL / not reachable (D1)** | The deployed staging host sends signed-out visitors to **production** (`StagingGate`, by design). To look past the gate the same `out/` build was served from `http://localhost:4173` (staging backend, request interception, no server): `/courses/`, `/venue/?id=`, `/fit/gyms/` and `/fit/gyms/timetable/?id=` all end on `/auth/login/` (`screenshots/courses-62`). The visitor price path in `TimetableCard` (no quote, regular price) can therefore never be seen by a visitor. |

### B. Customer (demo.customer; second and third customers journey.en / journey.it)

| Check | Result | Evidence |
|---|---|---|
| Timetable shows the discounted price, regular struck through | **PASS** | `15,00 €` struck, `12,75 €`, `−15%` for lessons with instructor B (`screenshots-it/courses-05`, `-06`, `screenshots/courses-67`); lesson 2 (instructor "Demo Provider", partner pending) `13,50 €` `−10%`; course C `−10%`; only the selected day is quoted on a phone, the filtered week on desktop. |
| Review: benefit lines, savings, final 12,75 | **PASS** | "Vantaggio struttura partner (10%)", "Vantaggio istruttore partner (5%)", list 15,00, total savings −2,25, your price 12,75 (`screenshots-it/courses-07`, `screenshots/courses-68`). Only "Paga direttamente al fornitore" is offered; no Stripe option (checkout is off). |
| `price_changed` | **PASS** | Review open on lesson 29 Oct; course price changed 15,00 to 16,00 with the Admin SDK; Confirm: HTTP 400 `enrollInCourse` (expected), banner "Il prezzo è cambiato. Controlla il nuovo totale e conferma di nuovo.", review now 16,00 / −2,40 / 13,60 (`screenshots-it/courses-08`); second Confirm booked at 13,60 (`courses-09`, enrollment `lesson 1360/240`). Price restored to 1500 right after. Note: the lesson list behind the sheet kept the stale `12,75 €` buttons (D15). Not exercised: the "lesson was updated" (availability) variant. |
| Confirm a lesson booking, shows in My course bookings | **PASS** | `screenshots-it/courses-09`: "Prenotazione confermata", "Singola lezione · 13,60 € · Da pagare". |
| Series uses all lessons; total; refund maths | **PASS** | Review lists 27, 28, 29 Oct, regular 40,00, savings −5,32, price 34,68 (`screenshots-it/courses-22`). Stored `totalCents 3468`, `allocations 1134 / 1200 / 1134` (sum 3468; lesson 2 only earns the 10% venue discount). Owner recorded cash, customer cancelled lesson by lesson: "Rimborsi: 11,34 €", then 34,68 € after all three (`courses-28`, `-29`); refund entries 11,34 + 12,00 + 11,34 = 34,68, all marked paid by the owner. |
| Free course books as direct / paid | **PASS** | Review: regular "Free", your price "Free", no payment line (`screenshots/courses-20`); result "Single lesson · Free · Paid", enrollment `confirmed / paid / total 0` (`courses-21`). |
| Full lesson, Join waitlist (journey.it.customer), position | **PASS** | Review of the full lesson shows "La lezione è al completo.", **Iscriviti alla lista d’attesa** and a disabled Confirm (`screenshots-it/courses-10`); "In lista d’attesa · posizione 1" (`courses-11`); My course bookings has a "Liste d’attesa" section with "Posizione 1" (`courses-12`). The label is "Posizione 1", not `#1`. |
| First customer cancels, waiting customer is promoted | **PASS** | After the cancel, enrollment `promotedFromWaitlist`, `confirmed`, 12,75 (current price), no Stripe; booking visible (`screenshots-it/courses-14`); inbox "Posto liberato … la tua prenotazione è confermata" in Italian (`courses-15`). |
| Leave waitlist | **PASS** | Needs a second step ("Leave the waitlist?" + button, see D4); entry removed from Firestore, counters consistent (`screenshots/courses-18`, `-19`). |
| Cancelling inside the deadline is refused with a translated message | **PASS** | The UI hides "Cancel booking" for a lesson inside the deadline (D10). To reach the server refusal the cancel prompt was opened on a lesson that was still cancellable, then the booking's snapshotted `cancellationHours` was raised with the Admin SDK; Confirm gave "The free cancellation deadline has passed." in the card (`screenshots/courses-33`, `-34`). |
| Stripe option hidden or disabled with checkout off | **PASS** | No radio or Stripe text in any review (lesson, series, free); `systemSettings/payments` both false. |

### C. Individual provider, unlinked (demo.provider)

| Check | Result | Evidence |
|---|---|---|
| Create a course without a venue, instructor = self | **PASS** | `/provider/courses/create/` defaults to "No venue (independent course)"; address, city, free-text instructor, own-profile checkbox, timezone editable (`screenshots/courses-30`). Saved as "K2 Individual Course" with no `venueId`, then edited to link own instructor profile (`instructorId = owner`). |
| Publish, preview lessons | **PASS** | Preview lists 22, 23, 24 Oct 7:00 PM; the preview takes about 4-6 s ("Loading…" first) (`courses-31`). |
| Roster, record payment | **PASS** | `courses-35`, `-36`; status goes "Payment pending" to "Paid". |
| Attendance after a past lesson | **PASS** | Needed a past lesson: after booking, two lessons' `startsAt` were moved 2 h into the past with the Admin SDK. Present persisted (`attendance: present`); Absent sets the "No-show" badge. Cancel and Reschedule are disabled for a started lesson. |
| Cancel a lesson with a refund due | **PASS** | Payment recorded, then "Cancel lesson" with reason: "Refund due · €10.00 · Elena Gallo", "Confirm refund paid" clears it (`courses-32`, `-37`). |
| Nothing venue-related forced | **PASS** | No venue, room or location field and no instructor list unless a venue is chosen. |
| Naming another provider as instructor gives `course_instructor_not_allowed` | **PASS (API) / not reachable in the UI** | The unlinked editor only offers free text or "my own profile", so the error cannot be triggered by clicking. A `saveCourse` call with another provider's `instructorId` answers 403 `course_instructor_not_allowed`. The translation exists in all five locales (it: "Per un corso senza struttura puoi indicare solo te stesso come istruttore."). Not seen rendered. |

### D. Venue staff (journey.it.provider, `venueStaff`) and owner

| Check | Result | Evidence |
|---|---|---|
| "Corsi della struttura" entry in professional mode | **PASS** | For a **customer-only** account given `venueStaff` the mode switch reads "Privato / Corsi della struttura" and links to `/provider/courses/?venue=smoke_unified_venue` (`screenshots-it/courses-53`); `/provider/dashboard/`, `/provider/earnings/`, `/provider/services/` all redirect to the venue page; page title "Corsi di Smoke Unified Gym" with the venue's 4 courses (`courses-54`, `-55`). The portal menu there lists "Gestisci corsi" and also "Assistente VFit" (the plan says only courses; D11). journey.it.provider is a full provider, so its menu is the normal one (`courses-40`). |
| Venue-scoped Manage courses, locations and rooms panel | **PASS** | Owner view `screenshots/courses-24`: courses list, "Locations and rooms", add location/room forms, "Linked instructors". |
| Create a venue course on behalf of the owner | **PASS** | Created by staff: Firestore `providerId = demo-provider-vfit` (owner), `venueId` set; timezone field read-only "Il fuso orario è quello della sede." (`screenshots-it/courses-43`). |
| Room / instructor overlap in preview and save | **PASS** | Preview: "Sala: In conflitto con «Smoke Unified A» (27 ott 2026, 18:00 – 19:00)" and "Istruttore: …" (`courses-41`); Save: "La sala è già occupata da «Smoke Unified A» (mar 27 ott, 18:00)." (`courses-42`). Fixed by room X + free-text instructor, saved. |
| Reschedule with a room | **PASS** | "Sposta lezione" has date/time and "Sala della nuova lezione". 28 Oct 18:00 in Room 2 gives "La sala è già occupata da «Smoke Unified C» (mer 28 ott, 18:00)." (`courses-50`, `-51`); 19:30 saves (Firestore: room 2, 18:30Z, revision 2). The lesson id stays `2026-10-27` while it now happens on 28 Oct. |
| Substitute instructor, overlap case | **PASS** | Lesson 27 Oct to "Demo Provider": "L’istruttore ha già «Smoke Unified D» nello stesso orario (mar 27 ott, 18:00)." (`courses-46`, `-47`). |
| Capacity raise promotes the waitlist | **PASS** | Lesson 28 Oct, capacity 1 full with waitlist 2 (Demo Customer, Francesca Riva); raising to 2 booked Francesca (`courses-45`), waitlist empty. |
| Remove participant | **PASS** | Inline form with reason; if the customer's deadline has passed it warns "Il termine di cancellazione del cliente è passato: la rimozione verrà registrata come cancellazione tardiva (nessuna penale)." (`courses-48`), then a "Cancellazioni tardive" list shows the customer (`courses-49`). |
| Waitlist entry removal | **PASS** | "Rimuovi dalla lista" then "Conferma rimozione"; positions renumber (Francesca 2 to 1) (`courses-44`). |
| Roster signals (late cancel, no-show) | **PASS** | Late-cancel list above. No-show: marking Absent on two past lessons produced the "No-show" badge and "2 no-shows" (`screenshots/courses-52`); real actions, so no seeding was needed. |
| Spaces panel: add room, deactivate | **PASS** | Added "K2 Temp Room", deactivated it ("Inactive / Reactivate") (`courses-56`, `-57`). |

### E. Admin (demo.admin)

`/admin/venues/` lists the fixture with status "Partner", an **Owner** column and "Active" (`screenshots/courses-58`, `-59`). The owner column shows a truncated account id (`demo-pro…`) rather than a name (D13). The detail `/admin/venues/?id=smoke_unified_venue` has the Locations and rooms panel with Add location/Add room and Deactivate/Reactivate, the Linked instructors panel with "Link instructor" (instructor id + partner status), "Partnership status" Pending/Active/Suspended (value `active`), "Manager account ID" (`demo-provider-vfit`), "Member discount (%)" 10 and "Partner instructor extra discount (%)" 5 (`courses-60`, `-61`). Nothing was saved.

### F. Hosting and service worker

1. **Returning browser with the pre-fix worker.** The shared Playwright profile still held the old `vfit-runtime` cache and two shell caches. After one load the active worker had replaced them (only `vfit-shell-<id>` remained, no HTML under a JS URL in any cache). That first load logged `Unexpected token '<'` twice; the next load was clean.
2. **Fresh context.** Caches: `vfit-shell-59e18027ddcbaf12` and `vfit-runtime-v2`; the old `vfit-runtime` is gone.
3. **Poisoned cache.** An HTML response was stored under a real `/_next/static/chunks/*.js` URL in `vfit-runtime-v2` and another under the legacy `vfit-runtime` name; both URLs were removed from the shell cache so the poisoned entries are the only candidates. A page-level `fetch` of each URL through the worker returned 200 `text/javascript` with real script text and the poisoned entry was replaced by the script (v2) or evicted (legacy). Two further reloads rendered the app normally with no page error. (Reloading alone never touched the poisoned entries, because the page's own chunk requests were answered from the shell precache or the browser memory cache first.)
4. `/_next/static/chunks/nonexistent.js` answers **404** (`text/html`, the hosting error page) and is not stored in any cache. `/courses/`, `/provider/courses/`, `/fit/gyms/timetable/`, `/venue/` answer 200 `text/html` shell pages.

### G. Accessibility and layout

| Check | Result | Evidence |
|---|---|---|
| Keyboard: day tabs | **PASS (note)** | Tabs are `button aria-pressed`, not a tablist: Tab and Shift+Tab move, Enter and Space select; arrow keys do not move focus. |
| Keyboard: dialogs | **PASS** | The booking sheet has focus inside on open (review heading), 14 Tab presses stay inside, Escape closes it. The mode switch and drawer behave the same. |
| Focus on first error | **PASS** | An empty editor submit focuses "Course name" (native validation). A server refusal (overlap) shows `role="alert"` text but leaves focus on the page body. |
| Targets at least 44 px | **PARTIAL (D8)** | Day tabs 48x56, cards 44+, week buttons 44x44 (39x44 at 320), buttons 44. Under 44: course-name links in My course bookings (144x28), the venue page back button (40x40). |
| No horizontal overflow at 320 and 390 | **PASS with one exception (D7)** | Timetable, My course bookings, venue page: scrollWidth equals clientWidth at 390 and 320 (Italian). German at 320: timetable fine; **My course bookings overflows by 6 px** (title). |
| Contrast, light theme | **FAIL (D2, D3)** and marginal for errors | Measured: `text-error` 4.83:1 on surface, 4.46:1 on the page background (#f4f6fa); `text-warning` 5.02 / 4.64; `text-success` 5.48 / 5.07; `text-section-primary` (cyan text on outline buttons and links) 1.94 / 1.80. Dark: error 4.21 on surface, 4.46 on page. |

## Defects, ranked

### D1 (high) Signed-out visitors cannot see the venue, course list or "public" timetable
- **Steps:** signed out, open `/fit/gyms/timetable/?id=smoke_unified_venue` (also `/venue/?id=`, `/courses/`, `/fit/gyms/`). Verified on the real build served from localhost (the deployed staging host additionally forwards visitors to production by design).
- **Expected:** a public weekly timetable with regular prices and a Book button that leads to a login prompt (docs, plan K2 step 2, `VenueTimetable` comment, anonymous-readable rules).
- **Actual:** `src/app/(main)/layout.tsx` redirects every signed-out visitor to `/auth/login` (no return path), so the visitor branch of the timetable and "Book → login prompt" are unreachable. `screenshots/courses-62`.

### D2 (high, light theme) The course sheet and booking review have no background
- **Steps:** light theme, open any course (`/courses/?id=…&lesson=…`) and its review.
- **Expected:** a readable surface.
- **Actual:** `Modal` draws only a dim, blurred backdrop and `src/app/(main)/courses/page.tsx:83-91` renders `p-5 space-y-4 text-content` on it, so dark text sits on a dimmed copy of the page. Estimated contrast: body 3.5:1, headings 3:1, success lines 1.1:1, error "This lesson is full" 1.3:1. Dark theme is fine. `screenshots/courses-16`, `-20`, `-33`, `-34`.

### D3 (medium, light theme) Cyan text fails contrast
- **Actual:** `text-section-primary` is 1.94:1 on a light surface (1.80 on the page): outline buttons "Browse courses", "Book lesson", "Join waitlist", "Cancel booking", the "← venue" link. **Expected:** at least 4.5:1 (3:1 for large text).

### D4 (medium) Confirm buttons of non-booking actions read "Confirm booking"
- **Steps:** My course bookings, Cancel booking; Leave waitlist; provider Record payment; Cancel lesson; Reschedule lesson.
- **Expected:** a verb that matches the action ("Cancel booking", "Leave", "Record payment").
- **Actual:** the confirm button says "Confirm booking" / "Conferma prenotazione" in all of them; the Record payment dialog also labels its method field "Pay the provider directly". `screenshots/courses-19`, `-27`, `screenshots-it/courses-13`.

### D5 (medium) A venue with no reviews is missing from the default Gyms & schools list
- **Steps:** `/fit/gyms/` signed in, no location, search "Smoke".
- **Expected:** the new partner venue is listed.
- **Actual:** the list is the top 50 by rating of 120 venues, so a rating-0 venue is absent until "Vicino a me" is used. `screenshots-it/courses-01`, `-02`.

### D6 (low) "Substitute instructor" on an unlinked course is a dead end
- **Actual:** the action is offered for an upcoming lesson of an independent course with an empty "Venue instructor" select; the guide says it is for venue courses. `screenshots/courses-38`.

### D7 (low) German title overflows at 320 px
- "Kurse und Gruppenaktivitäten" (`/courses/`) is 306 px wide in a 284 px column; page scrollWidth 322 vs 316. `screenshots/courses-66`.

### D8 (low) Targets under 44 px
- My course bookings course-name links 144x28; venue back button 40x40; week prev/next 39x44 at 320.

### D9 (low) "Participants" opens the roster below the course list
- On a phone the panel appears after the last course card and the page does not scroll to it, so the click looks inert. `screenshots/courses-25`.

### D10 (low) No reason shown when "Cancel booking" is absent
- A lesson inside its cancellation window shows no Cancel button and no explanation.

### D11 (low, observation) Staff portal menu includes "Assistente VFit"
- Plan K2 step 5 expects only Courses; the menu shows "Gestisci corsi" and "Assistente VFit".

### D12 (info) Details
- Day tabs are not a tablist (no arrow keys). Server-side save errors do not move focus.
- Lesson ids do not follow a rescheduled date (id `2026-10-27` on 28 Oct).
- The series enrollment stores `discountPercent 15` although lesson 2 got 10%.

### D13 (info) Admin Owner column shows a truncated account id, not a name.

### D14 (info) Timetable opens on the current week with an empty message even when next week has lessons (no jump to the next lesson); the empty message sits above the day tabs.

### D15 (info) After `price_changed` the lesson buttons behind the sheet keep the old price (`12,75 €` while the review says 13,60).

### D16 (info) Fixture only: courses C, Free and D show the instructor "placeholder" (seed sends `instructor: 'placeholder'` with no `instructorId`).

### D17 (info) One-time console error `Unexpected token '<'` on the first load of a browser profile that still had the pre-fix worker and caches (see F.1); not reproduced on a fresh context.

## Console errors and failed requests

Recorded at every step (browser console plus network). Everything observed:
- `HTTP 400` on `enrollInCourse` (price_changed), `cancelCourseEnrollment` (deadline), `saveCourse` and `previewCourse` (room/instructor overlap), `manageCourseSession` x4 (substitute and reschedule overlaps): expected callable refusals; each surfaced a translated message.
- `HTTP 403` `saveCourse` (my deliberate `course_instructor_not_allowed` API call); `HTTP 404` `/_next/static/chunks/nonexistent.js` (deliberate).
- `Unexpected token '<'` x2 and "An unknown error occurred when fetching the script" on the first loads of the stale-worker profile (F.1).
- `net::ERR_FAILED` on `vfit-funlife.web.app` requests: the staging gate redirect to production, aborted by my interception on the first attempt (prefetches); on a second attempt the page itself loaded from production as a signed-out visitor (shell only, no interaction, no writes; the local worker and caches it created were removed).
- `[sw] app-shell registration failed` on `http://localhost:4173`: the intercepted local origin, expected.
- Warnings only otherwise: font preload not used, `scroll-behavior` notice, `@firebase/firestore BloomFilterError`.
- No `pageerror` and no uncaught exception in any signed-in scenario.

## State changes made and restored

| Change | Restored |
|---|---|
| Course A `lessonPriceCents` 1500 to 1600 (price_changed) | Back to 1500 immediately. |
| Bookings, waitlist entries, refunds on course A, Free and the K2 courses | My bookings were cancelled (A 28 Oct x2, Free x1) or deleted with their courses. History rows on **course A** (cancelled series enrollment with 3 paid refunds, cancelled promotion enrollments) remain and are removed by K3's `--cleanup`. The smoke's own bookings (A 27 Oct c2 paid, Free c1) were left alone. |
| Course A lesson 28 Oct capacity 1 to 2 | Back to 1 (final A: 27 Oct cap 2 occ 1, 28 Oct cap 1 occ 0, 29 Oct cap 1 occ 0). |
| Created "K2 Individual Course" and "K2 Staff Course"; two lessons of the first were moved 2 h into the past (Admin SDK) | Both cancelled with `cancelRemainingCourse`, then their courses, enrollments, refunds deleted. Two orphan instructor-lock slots for the shifted lessons were removed; `checkLocks` for the K2 ids is empty. |
| Rooms "K2 Temp Room" and "K2 Temp Room 2" | Deleted. "Smoke Room X" was deactivated by a mis-click and reactivated. |
| `venueStaff/<journey.it.customer>` granted | Deleted. The smoke's `venueStaff` for journey.it.provider is unchanged. |
| Profile preferences (theme and language buttons in the app write to the user doc) | demo.customer `theme: light`, `preferredLanguage: it`; journey.it.provider `preferredLanguage: en`, `theme: light`; journey.en.customer `theme` removed. If an account had no theme field before, it now has `light` (could not be known). |
| Temporary scripts | Deleted (scratchpad). |

## Could not verify

- **Visitor view on the deployed host** (gated to production by design) and everything that depends on it: regular price for visitors, Book → login prompt (D1).
- Stripe checkout path, "Pay within N minutes" hint, online refunds: checkout is off on staging.
- The availability variant of the review notice ("The lesson was updated…"), a series booking refused because a lesson is full (only a disabled button was seen), "Add participant" and "Notify" flows, push and email delivery.
- `course_instructor_not_allowed` rendered in the browser (no UI path); German, French and Spanish screens beyond the two German 320 pages; real devices and screen readers.
- The "owner changes capacity in a second context while the review is open" variant of plan K2 step 3 was replaced by the price change.

## Regression after gym-flow removal (L7)

- **Date:** 2026-10-20. **Site:** https://vfit-app-staging.web.app (project `vfit-app-staging`; production not touched).
- **Build under test:** hosting rebuilt with `npm run build:staging` from `main` at `f7c876b` (gym screens, `src/lib/firebase/gym.ts` and the `gym.*` callables removed); functions redeployed with the nine gym functions deleted; rules and indexes redeployed (the 3 gym indexes and the 4 stray `providerType` indexes deleted); the gym collections were already empty (cleanup script 0 to 0). Backend smoke `scripts/smoke-unified-courses-staging.mjs --keep`: 25 of 25 PASS.
- **Method:** Playwright MCP, 390x844, one fresh private browser context per actor, service workers blocked, English and Italian, light and dark. Accounts: `demo.customer`, `demo.provider` (owner of the fixture venue and an individual provider), `journey.it.provider` (venue staff), `demo.admin`. Screenshots are `courses-L7-NN-<slug>.png` in `screenshots/` (English) and `screenshots-it/` (Italian). Signed-out visitors are redirected to production by the staging gate, so every actor signs in at `/auth/login/` first.
- **Console and network:** every actor's console and failed-request log was collected for the whole session. No `error`, `pageerror`, HTTP 4xx/5xx or failed callable was seen. The only entries were aborted Firestore `Listen` long-poll requests, aborted Next.js route prefetches and the "service worker blocked" warning caused by the test setup. No request to any removed callable (`bookGymClass`, `quoteGym*`, `saveGymSchedule`, ...) and no `gymSessions` / `gymBookings` read appeared in the resource list of the admin and customer sessions.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | `/bookings` has no gym tab or section | **PASS** | Only "My course bookings" chip, Upcoming / Past / Cancelled, no "gym" text in `main` (`courses-L7-01`, `-16`) |
| 2 | `/bookings?tab=gym` just shows the default view | **PASS** | Identical page, no error (`courses-L7-02`) |
| 3 | `/courses?tab=bookings` | **PASS** | Course bookings list with Cancel booking, refunds and payment lines (`courses-L7-03`) |
| 4 | Venue timetable, customer, en light and it dark | **PASS** | Next week, Tue 27: Smoke Unified A "Regular price 15.00, Your price 12.75, -15%", C 13.50 (-10%), Free; location/room/instructor filters (`courses-L7-04`, `-12`) |
| 5 | Discounted booking review: sheet surface in light and dark | **PASS** | White surface in light, dark surface in dark, benefit lines (10 % + 5 %), regular 15.00, savings -2.25, your price 12.75 (`courses-L7-05`, `-06`, it `-13`, `-14`). Not-yet-selected lesson buttons are disabled (opacity 0.5) while a review is open: looks pale in light, expected |
| 6 | Confirm, then cancel the booking | **PASS** | "Booking confirmed", then "Yes, cancel booking": row shows Cancelled, 12.75 (`courses-L7-07`, `-08`, `-09`) |
| 7 | `/fit/gyms` listing | **PASS** | "Gyms & schools" list with PARTNER badges (`courses-L7-10`) |
| 8 | `/venue?id=smoke_unified_venue` | **PASS** | "Next lessons" (A, C, Free) and "Full timetable" link (`courses-L7-11`) |
| 9 | `/gym/manage/` is gone | **PASS (note)** | No gym manager. Hosting's catch-all rewrite answers 200 with the public landing page, not a 404 status; same as any unknown route |
| 10 | Owner: venue courses entry, locations and rooms panel | **PASS** | `/provider/courses/?venue=smoke_unified_venue` lists A, C, Free; panel with Smoke Location, rooms 1, 2, X, linked instructors (`courses-L7-17`, `-25`, `-26`) |
| 11 | Owner: roster and lesson actions | **PASS** | Lesson select, Add participant, Cancel lesson, Reschedule, Substitute instructor, Change capacity, participants with payment, attendance, remove, notify (`courses-L7-18`, `-19`) |
| 12 | Venue staff (`journey.it.provider`) | **PASS** | Portal shows Manage courses, venue list and roster with the same lesson actions (`courses-L7-27`, `-28`) |
| 13 | Individual provider, unlinked: create, preview, save, cancel | **PASS** | "L7 Regression Yoga" no venue: preview lists 20 Nov 2026 11:00, `saveCourse` 200, `cancelRemainingCourse` 200, lesson Annullato and course Archiviato (`courses-L7-20` to `-24`) |
| 14 | Admin: venue detail with the spaces panel | **PASS** | `/admin/venues/?id=smoke_unified_venue`: partner fields, Locations and rooms, Linked instructors (`courses-L7-29`, `-30`) |
| 15 | Sheet contrast fixes (K2-fix) in light | **PASS** | D2 is fixed: the sheet and review have an opaque surface, text and the green benefit lines are readable (`courses-L7-05`, `-14`) |
| 16 | Console errors and removed callables in network failures | **PASS** | See the summary above |

**Defects.** None blocking. Observations: (a) the editor's "Preview lessons" button does nothing visible when a required field is empty (the category combobox and the instructor name); only the browser's native validation bubble tells the user, which headless screenshots do not show. (b) The fixture courses show the literal instructor text "placeholder" in the timetable and venue page because the smoke script seeds it (`instructor: 'placeholder'`); it is fixture data, not a product defect. (c) `/provider/courses/` without `?venue=` for venue staff shows the own-courses view (empty) first; the venue is chosen in the select.

**Cleanup (K3).** After this pass `node scripts/smoke-unified-courses-staging.mjs --cleanup` removed the fixture: `venues/smoke_unified_venue` does not exist, no course has `venueId: smoke_unified_venue`, and no `courseScheduleLocks` slot remains (two older day documents for 22 and 23 Oct 2026 `instructor:demo-provider-vfit` exist with `slots: {}`). The archived "L7 Regression Yoga" course (cancelled lesson, no participants) was left in place.
