# Business accounts production release — 2026-10-06

**Deployed successfully:** https://vfit-funlife.web.app. Application source: `feat/business-accounts` at `5410480` (last application change `1777547`). Unrelated uncommitted main changes were excluded. The release is published on its feature branch; shared main was not merged or modified.

## Deployment and verification

Staging was restored to the release and passed a fresh company signup, pending-state/VAT ownership assertion, ordinary admin approval with persisted nested verification, public profile rendering and a 390px admin layout check. Production then received rules/indexes, eleven targeted functions and the production-configured hosting build. All 53 production indexes are READY. All 92 admin query shapes (page and count) passed, with zero missing indexes or other errors. New hosting version: `7ab4d5ab3a025f9d`; previous version: `837406685c76c8d3`.

The functions were `applyAsProvider`, `decideProviderApplication`, `releaseBusinessVat`, `convertBusinessToIndividual`, `updateBusinessTaxId`, `verifyProvider`, `onInstructorWriteSearchIndex`, `onUserWriteAdminIndex`, `adminDeleteUser`, `adminBulkDeleteUsers`, and `onAdminJobCreated`. Production deployment hooks, including functions lint/build and hosting project validation, passed.

Required derived admin-field backfill updated only `providerKind` on 102 production user records with zero failures. A second dry run found zero updates remaining. Staging required zero changes; provider-search token dry runs required no changes in either environment. Writes used document update-time preconditions.

Fresh automated gates: 351 release-focused frontend/i18n checks, 882 backend src checks, and 69 emulator rules checks passed. Both staging and production builds passed. A broader root frontend-command run has 23 failures across 5 suites, reproduced with identical failure names on the base main commit; that broad suite is not clean. The initial completely unscoped run additionally picked up emulator-dependent/backend suites under the wrong runner configuration and is not used as the release gate.

Production browser smoke: fresh company signup, pending state and exclusive VAT claim; home, booking/search, bookings, chat and profile route rendering. No captured browser page exceptions. This is a smoke test, not exhaustive interaction coverage. Production company approval, completed-session payment/review/receipt, external card charges/refunds, OAuth, SMS and native push delivery were not exercised. The production testing guide covers follow-up checks.

The two findings from the preceding broad staging smoke—missing business signup and mobile admin detail overflow—were resolved by restoring the reviewed business branch; that earlier staging deployment had drifted to other code. The application source was not changed during this release.

## Evidence and cleanup

- [Staging browser smoke](business-production-evidence/vfit-app-staging-smoke.json)
- [Production browser smoke](business-production-evidence/vfit-funlife-smoke.json)
- [Production index readiness](business-production-evidence/production-indexes.json)
- [Manual production test checklist](../user-journeys/production-release-checklist.md)

Synthetic company Auth accounts, users/instructors documents and subcollections, provider applications and VAT claims were removed. Production absence was checked directly in Auth and Firestore. Temporary staging allowlist entries were removed. No production test booking or payment was created. Audit history was retained. Browser sessions were isolated and no production authentication state file was saved.

Test-harness retries corrected a translated button selector, Firebase Admin module initialization, the nested verification field and an assertion that ran before approval completed. They did not require application code changes. All temporary accounts from the retries were cleaned before the successful run.
