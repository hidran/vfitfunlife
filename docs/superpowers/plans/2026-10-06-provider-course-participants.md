# Provider-managed course participants

Authorized scope: providers enroll linked clients in group lessons/series, add new people inline (full name and email required; surname and phone optional), invite by email or phone, and retain many-to-many provider/customer links after account confirmation. Preserve unrelated workspace changes. Deploy and smoke-test staging under the session's existing authorization.

Use existing `clients` provider/user pairs, existing invited Auth profiles, and verified email account activation. Do not create a second identity/roster system. Phone invitations open SMS/WhatsApp on the provider's device unless the pending preference changes; share links contain no Auth credentials. Existing accounts are reused by normalized email, and one user may have multiple provider relationships.

Implementation:
- Add provider-authorized enrollment with linked-client enforcement, direct payment, ordinary atomic capacity/duplicate checks, createdBy audit; customer course bookings create a missing relationship atomically.
- Extend account creation with optional email delivery, preserving current default behavior.
- Add relationship-scoped participant invitation callable: private email setup links, credential-free phone share links; expose registration-completion page.
- Add inline searchable client/participant form on provider course lesson roster; surname/phone optional, select lesson or whole series, explicit invite channels.
- Protect relationship identities in Firestore rules; test many-to-many, unauthorized/cross-provider calls, duplicate membership, registration activation, notification recipients and secret-free phone links.
- Update APIs/schema/features/user journeys, build/test, review, deploy and smoke-test staging. Do not send messages to real recipients during QA.

Implementation and review completed. Frontend full suite: 856 tests; backend full suite: 998 tests with fresh emulator and sequential files. Scoped lint, backend lint/build and staging static build passed. Review regression covers changed participant details after a failed enrollment; staging-derived regression covers invited status on a second provider's new pair. Staging hosting, rules and callables deployed; final account-claim smoke is recorded in deployment docs/evidence.
