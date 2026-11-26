# Care Associate

Care Associate helps patients arrange practical assistance during hospital visits and lets verified Care Associates manage assigned work.

## Project structure

- `care-associate/` — Expo / React Native mobile app
- `care-associate-server/` — Express API, MongoDB models and pricing logic

## Run locally

### 1. Start the API

```bash
cd care-associate-server
npm install
cp .env.example .env
```

Edit `care-associate-server/.env` and set:

- `MONGO_URI` — your MongoDB connection string
- `JWT_SECRET` — a unique random secret with at least 32 characters
- `ADMIN_PHONE` — a phone number reserved for the administrator
- `ADMIN_PASSWORD` — a unique password with at least 12 characters
- `PORT` — API port (default: 5001)
- `CASHFREE_CLIENT_ID` and `CASHFREE_CLIENT_SECRET` — Cashfree PG credentials from the merchant dashboard
- `CASHFREE_ENV` — `SANDBOX` for testing, then `PRODUCTION` after Cashfree activates your account
- `CASHFREE_API_VERSION` — Cashfree API version (default: `2023-08-01`)

Start MongoDB, then run:

```bash
npm run dev
```

On the first successful start, the API creates the administrator account if that phone number does not already exist. Later restarts do not reset the admin password. Keep the real `.env` file private and never commit it.

### 2. Start the mobile app

Open a second terminal:

```bash
cd care-associate
npm install
npx expo start -c
```

Cashfree uses a native React Native module, so Expo Go is not supported for payment testing. Build a native development app after installing dependencies:

```bash
npx expo prebuild
npx expo run:android
```

Use a physical Android device or emulator. The app uses port 5001 by default; if you change `PORT`, update `API_PORT` near the top of `care-associate/App.js`.

## Phase 1 safeguards

- Public registration only allows Patient and Care Associate roles; administrator accounts are bootstrapped from private server environment variables.
- API startup fails when database/JWT/admin secrets are missing or too weak.
- Booking requests validate service, hospital, city, date range and a maximum duration of 240 hours.
- Care Associates must be verified, available, in the booking city, not on leave, and free of overlapping work before accepting a job.
- Only Care Associate accounts can be verified by an administrator.
- Aadhaar images remain in the server's private uploads directory and are excluded from Git.

## Important security notes

- Use only masked Aadhaar images (only the last four digits visible). Limit access to uploaded identity documents to authorized administrators.
- Do not use sample credentials or commit `.env`, uploaded documents, database dumps, signing keys or access tokens.
- Configure HTTPS before exposing the API publicly.
- This app is an assistance service and is not an emergency medical service. For emergencies in India, contact 112 or the local emergency service.


## Cashfree payments

1. Create/activate a Cashfree Payment Gateway account and generate **Sandbox** App ID and Secret Key.
2. Put those values only in the server's private environment variables (local `.env` or your hosting provider). Never put the Secret Key in the mobile app, GitHub, or a screenshot.
3. Keep `CASHFREE_ENV=SANDBOX` while testing. Set the Cashfree webhook URL in the merchant dashboard to `https://YOUR_API_HOST/api/payments/cashfree/webhook` and subscribe to payment success/failure events.
4. The app creates a Cashfree order on the server. A booking remains unavailable to Care Associates until the server independently fetches the order from Cashfree and confirms `PAID`.
5. After successful sandbox tests, complete Cashfree's merchant/KYC activation and switch the server environment to `PRODUCTION` with production credentials.

The mobile checkout uses Cashfree's native React Native SDK. Expo Go cannot load this native module; use an Android development build. The webhook and payment verification endpoints must be reachable over HTTPS in production. Do not manually mark bookings paid.


## Phase 3: messaging, notifications and duty tracking

- Booking push alerts use Expo Push Service. From `care-associate/`, run `npx eas-cli@latest init`, copy the generated project ID into `expo.extra.eas.projectId` in `app.json`, and configure Android FCM v1 credentials in the EAS project before testing remote push notifications.
- Chat is private to the Patient and assigned Care Associate for confirmed bookings. Messages are retained with the booking (latest 200) and the app refreshes the open chat periodically.
- Call actions use the device dialer and the phone number already shared with the assigned booking participant.
- The Care Associate's location is sent only while the booking is in the `ongoing` duty state. The Android foreground service shows a persistent notification; the server exposes the latest location only to the booking participants and clears it when duty ends.
- The Care Associate can share an arrival ETA (1–600 minutes) before duty starts. This is a manually supplied estimate, not a route-calculated prediction.
- Location history is not retained. Background location can stop if the user force-stops/terminates the app or the device vendor restricts background execution. Test on real Android devices.
- Background location requires a separate Play Console declaration/review and a clear in-app disclosure. Request it only when the Care Associate starts an accepted duty; do not use it for background tracking outside active work.

### Phase 3 mobile build

After configuring the EAS project and credentials, install and generate a fresh native build (Expo Go does not support remote push delivery or background location):

```bash
cd care-associate
npm install
npx expo prebuild
npx expo run:android
```

Test with two separate accounts/devices: Patient and verified Care Associate. Verify push alerts, chat access boundaries, call launch, screen-off location updates, ETA changes, and automatic location shutdown after duty completion. Do not publish until Android background-location policy approval and device testing are complete.
