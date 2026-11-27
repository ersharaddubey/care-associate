# Care Associate Product Roadmap

This roadmap separates implemented workflows from planned work. A UI screen is not considered complete until its API, authorization, error/loading states, and end-to-end tests are also in place.

## Current implemented foundation

- Patient/helper/admin role-based app navigation
- Patient service selection and booking flow
- Booking history, cancellation, repeat booking, ratings and favourites
- Helper availability, leave calendar, job list, job acceptance, duty start/end and earnings view
- Booking chat, ETA sharing, helper location updates and patient-side location refresh
- Patient family profiles, saved hospitals and favourite associates
- Emergency assistance requests and safety incident reports
- Admin user verification, Aadhaar review, helper suspension, bookings, refunds, payout reconciliation and audit log
- Production API health indicator and recoverable React error boundary
- Dedicated patient service pages, family/emergency subpages, helper job details and booking details
- Admin overview, searchable user list, user detail, searchable/filterable booking list and booking detail

## Phase A — Core experience and operational reliability

- [x] Patient booking detail page
- [x] Helper job detail and acceptance checklist
- [x] Admin overview dashboard
- [x] Admin user search and role filters
- [x] Admin user detail and verification actions
- [x] Admin booking search, status filters and detail page
- [ ] Device-level regression testing for patient/helper/admin roles
- [ ] Verify notification delivery on physical Android devices
- [ ] Add explicit empty/error/retry states to every data-driven screen

## Phase B — Patient experience

- [x] Family profiles
- [x] Saved hospitals
- [x] Favourite Care Associates
- [x] Booking history and repeat booking
- [x] Booking chat and location view where the booking state permits
- [x] Booking reschedule workflow with 24-hour cutoff, two-change limit and assigned-helper conflict checks
- [ ] Family-member booking with explicit consent and authorization
- [x] Patient document vault with authenticated private image upload/download/delete, owner-only access and optional expiry metadata/reminders
- [x] On-device appointment reminders at 24 hours and 2 hours before paid upcoming bookings (respects notification preferences); [ ] follow-up reminders
- [x] Visit checklist and digital handover with helper-only updates and patient read access
- [ ] Invoice/receipt history and downloadable receipts
- [x] Support ticket lifecycle and complaint tracking (patient/helper inbox, admin queue, replies and status transitions)
- [ ] Accessibility preferences and senior-friendly mode

## Phase C — Helper experience

- [x] Availability toggle and leave calendar
- [x] Job discovery, search and job details
- [x] Verified/available guards before accepting a job
- [x] Duty start/end and location tracking
- [x] ETA sharing and booking chat
- [x] Earnings view
- [x] Detailed helper payout history with pending/paid/failed status and transfer references
- [x] Downloadable payout statements (authenticated, helper-scoped CSV export)
- [x] Helper document status centre with private upload, owner-only access, admin approve/reject review and optional expiry reminders
- [x] Five non-clinical training modules with server-graded quizzes and persisted completion progress
- [x] Admin work-hour and attendance reports with date/city filtering and CSV export
- [x] Helper rating/performance history with review feed from completed bookings
- [x] Verified-helper referral codes, referral tracking, admin qualification and manual incentive payout ledger
- [x] Helper safety check-in/check-out records during active duties; [ ] automated escalation workflow

## Phase D — Admin and business operations

- [x] User verification and Aadhaar review
- [x] Booking operations list and detail
- [x] Refund workflow integration
- [x] Payout reconciliation and payout status
- [x] Incident management and audit trail
- [x] Emergency request management
- [x] Overview metrics and searchable operational lists
- [x] Admin service catalogue editor (service visibility, title and description); [ ] dynamic pricing editor
- [x] Manual helper assignment with city, verification, availability, leave and active-booking conflict checks
- [x] Complaint/ticket management (role-scoped tickets, admin replies, status filters and persistent alerts)
- [x] City and hospital operations reports with date-range and city filters
- [x] Exportable operations CSV report with spreadsheet formula-injection escaping
- [x] Exportable finance reports with date/city filtering and formula-safe CSV
- [ ] Admin role/permission matrix
- [ ] Refund and payout exception queue

## Phase E — Platform capabilities

- [x] Production API health check
- [x] Role-based API authorization foundation
- [x] Booking chat and location APIs
- [x] In-app notification centre with recipient-scoped inbox, unread count, mark-read, mark-all-read and delete
- [x] Persist booking and emergency-request alerts for in-app delivery; retain Expo push delivery
- [x] Push notification preferences and delivery audit (provider outcomes, skipped and failed attempts)
- [ ] Multi-language completion across all screens
- [ ] Security/privacy review and data retention controls
- [x] Persistent Mongo-backed rate limits for login, registration, payment creation and booking chat; [ ] broader suspicious activity monitoring
- [x] Support ticket and private document route/schema tests; [ ] Automated API integration tests for all critical flows
- [ ] Crash reporting and app version diagnostics

## Phase F — Integrations and expansion

- [ ] Hospital directory and verified hospital partnerships
- [ ] Hospital queue/token integration (only with a partner data source)
- [ ] Hospital appointment integrations
- [ ] Subscription packages and recurring bookings
- [ ] Coupon campaigns (referral and incentive ledger is implemented separately)
- [ ] Multi-hospital visit planner
- [ ] Advanced demand, retention and service-quality analytics

## Completion rule

A planned item is complete only when:
1. The backend endpoint/model and access control exist where required.
2. The mobile UI handles loading, success, empty and failure states.
3. API tests cover authorization and validation.
4. The Android build and relevant end-to-end flow pass.
5. The feature is verified against the deployed API without using real patient data for test fixtures.
