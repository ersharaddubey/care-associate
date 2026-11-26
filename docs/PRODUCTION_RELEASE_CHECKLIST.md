# Care Associate — Production Release Checklist

This checklist excludes Cashfree/payment-gateway onboarding and payment testing.

## Verified in repository / automated checks

- [x] Phase 3 messaging, notifications, booking chat and duty-tracking implementation is in the repository history.
- [x] Phase 4 earnings/refund/invoice code is present on `phase-6-smart-operations` (payment gateway setup and validation intentionally excluded).
- [x] Phase 5 patient-experience features are present on `phase-6-smart-operations`.
- [x] Phase 6 lifecycle, matching, safety, audit and payout-ledger code is present on `phase-6-smart-operations`.
- [x] Server test workflow passed for commit `ce49f69174d8ae8e2bd7be352e32662990ba3c5e`.
- [x] Android `assembleDebug` and `expo export --platform android` passed on that same commit.
- [x] Expo dependency version mismatch was corrected in `care-associate/package.json` on the current branch.
- [ ] Re-run and confirm all CI jobs for the current head commit `d8f286edd62540531ba6505ae49bf34f212a8a0b`. The server test step has passed; Android workflow is still running at the time this checklist was written.

## Owner / environment setup required

- [ ] Choose and configure a production API hosting provider and HTTPS domain.
- [ ] Provision production MongoDB, restrict network access, enable backups and verify restore procedure.
- [ ] Set production environment variables privately: `MONGO_URI`, a strong `JWT_SECRET`, `ADMIN_PHONE`, `ADMIN_PASSWORD`, and `PORT`. Never commit secrets.
- [ ] Confirm admin bootstrap access, password rotation and account recovery procedure.
- [ ] Configure EAS project using `npx eas-cli@latest init`; add the generated project ID to `care-associate/app.json`.
- [ ] Configure Android FCM v1 credentials in the EAS project and verify push delivery.
- [ ] Configure the real support phone number in `care-associate/app.json` only if the business will provide phone support.
- [ ] Approve the platform commission rate privately before enabling earnings/payout reconciliation; do not guess a rate.

## Required device and end-to-end validation

- [ ] Test patient registration, associate registration, admin verification and sign-in on physical Android devices.
- [ ] Test booking creation, associate acceptance, on-the-way, duty start and completion with separate patient and associate accounts.
- [ ] Test location permission granted, denied, revoked and approximate-location cases.
- [ ] Test screen-off/background location during an active duty and confirm the foreground-service notification is visible.
- [ ] Confirm location is not shared before duty starts and is cleared immediately after duty completion/cancellation.
- [ ] Test push notifications on physical devices with the app foregrounded, backgrounded and terminated.
- [ ] Test participant-only chat, call actions, ETA updates and unauthorized booking access.
- [ ] Test incident reporting, admin triage, associate suspension/re-verification and audit-log visibility.
- [ ] Test emergency assistance request delivery and admin acknowledgement; clearly communicate that the app is not emergency dispatch and users in India should call 112 for emergencies.
- [ ] Test on a representative range of Android versions and device vendors, including background execution restrictions.

## Privacy, safety and policy approvals

- [ ] Publish a privacy policy that accurately describes identity documents, location, notifications, chat and retention.
- [ ] Approve and implement an Aadhaar/identity-document retention, access, deletion and breach-response policy.
- [ ] Approve complaint handling, incident escalation, suspension appeal and emergency escalation procedures.
- [ ] Complete security review of authentication, admin authorization, upload access, rate limiting, logs, backups and production CORS.
- [ ] Complete Google Play background-location declaration, prominent disclosure and permission review before release.
- [ ] Complete business/legal review of patient and associate terms, consent language and service limitations.
- [ ] Translate remaining screens and user-facing errors into Hindi if Hindi is advertised as a fully supported language.

## Integration and release gates

- [ ] Integrate Phase 4, Phase 5 and Phase 6 into `main` through a reviewed pull request after CI is green.
- [ ] Resolve the current branch's one-commit divergence from `main` and verify mergeability before merging.
- [ ] Generate a signed Android release build from the integrated `main` branch.
- [ ] Install and smoke-test the release build, verify package ID/version, permissions, app links and crash-free startup.
- [ ] Complete Play Console store listing, privacy declarations, data safety form, content rating and release review.
- [ ] Roll out to internal/closed testing first; monitor crashes, API errors, notification delivery and incident reports before wider release.

## Important implementation limitations

- Associate distance is a straight-line estimate, not road distance or ETA.
- Payout records represent manually completed bank/UPI transfers; the app does not initiate transfers.
- Emergency assistance is an in-app request/notification workflow, not emergency dispatch or medical care.
- A successful CI build does not replace real-device testing, policy approval or production security review.

Do not mark owner-controlled or device-tested items complete until evidence is recorded.
