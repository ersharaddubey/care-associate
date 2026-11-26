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

Scan the QR code with Expo Go. The phone and computer must be on the same Wi-Fi network. The app uses port 5001 by default; if you change `PORT`, update `API_PORT` near the top of `care-associate/App.js`.

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
