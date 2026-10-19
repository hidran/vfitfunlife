# Business-account staging verification — 2026-10-05

Environment: `vfit-app-staging` (`https://vfit-app-staging.web.app`). Deployed code: `1777547`, including fixes `b20417d`, `0de4ac7` and `b465288`. Tests used private Chromium contexts and synthetic Italian tax IDs and `@qa.vfit.invalid` accounts. Screenshots use a 390×844 viewport unless the filename specifies 320px; full-page captures include content beyond the viewport.

| Check | Result | Light evidence | Dark evidence |
|---|---|---|---|
| Company signup and checksum error | Inline error; VAT receives focus; no horizontal overflow | [Italian 390](it-signup-390-light.png), [German 390](de-signup-390-light.png) | [Italian 390](it-signup-390-dark.png), [German 390](de-signup-390-dark.png) |
| Manual approval required | Pending even with individual auto-approval enabled | [Pending](it-pending-light.png) | [Pending](it-pending-dark.png) |
| Duplicate tax ID | Refused; account already created is reused when correcting the number | [Duplicate](it-duplicate-light.png) | [Italian](it-duplicate-390-dark.png), [German](de-duplicate-390-dark.png) |
| Ordinary admin review | Business filter and all four reviewed fields visible; approval updates status immediately | [Approved](it-admin-approved-light.png) | [Approved](it-admin-approved-dark.png) |
| Public search and detail | Updated name, uploaded logo, company badge and verified status | [Search](it-search-light.png), [Detail](it-public-light.png) | [Search](it-search-dark.png), [Detail](it-public-dark.png) |
| Customer booking | Saved request shows the company's updated name | [Booking](it-booking-light.png) | [Booking](it-booking-dark.png) |
| Owner profile editing | Name/logo save; legal information has no editable inputs | [Profile 390](it-profile-390-light.png) | [Profile 390](it-profile-390-dark.png) |

Additional width checks: [Italian signup 320 light](it-signup-320-light.png), [dark](it-signup-320-dark.png), [German signup 320 light](de-signup-320-light.png), [dark](de-signup-320-dark.png), [Italian duplicate 320](it-duplicate-320-dark.png), [German duplicate 320](de-duplicate-320-dark.png), [profile 320](it-profile-320-light.png). Business inputs/selects measured 52px high and action buttons at least 44px. Bad-checksum and duplicate errors focused the VAT field at both widths in Italian/German. The [individual application](it-individual-autoapproved-dark.png) still auto-approved.

The main company was `QA Business 20261005 SRL`, publicly renamed from `QA Sport 20261005` to `QA Sport Updated 20261005`. Its HIIT service was activated with a €15 price. Customer booking `T8h4OZeeRQS2TCHk8VVr` requested 2026-10-07 at 09:00 and displayed the renamed company. No payment was collected.

Admin actions ran through the real UI and wrote audit records: approval `rmvuYlb6TO7KAXFHJwpF`, tax-ID correction `kBhUmfBI1vVMJBSeHX9o`, rejected-company claim release `kZR7WXDTqwDsJmCeSqXh`, conversion `q7Hywbkv67nTL9Jm7QTZ`. A second business confirmed the final refresh fix: rejection exposed the release action immediately, then approval immediately showed verified status (`VPF36aV4hIPBgJ98ay7X`, `kltMJ0KchBXrRiKYc9XN`).

Final automated checks: 347 frontend tests across 29 changed test files; 882 backend tests across 73 files; 69 emulator rules tests across four suites; four locale-completeness checks. Web TypeScript, touched ESLint, functions lint/build and staging build passed. Staging rules, changed decision function and hosting were deployed successfully.

Cleanup verified: all five temporary Auth accounts, user/instructor documents and subcollections, provider applications, uploaded files, VAT claims, allowlist entries and the test booking were removed. Audit records remain. Demo admin locale was restored to English. Production deployment remains B11.

The final screenshot audit found the existing admin tabs overflowing to 525px. Code `4ce0263` wraps those tabs, and `1777547` wraps long subtitle emails; corrected admin screenshots use a temporary layout fixture with the same reviewed details, removed after the check.

Final Playwright assertions on `1777547`: document width equals viewport at 320/390px in light/dark; all admin tabs are reachable. The temporary layout fixture and browser auth-state files were removed. All 28 PNG evidence files passed integrity/width checks and guide links resolve.
