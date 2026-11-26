# Care Associate

Terminal 1 (server; MongoDB must be running):
  cd care-associate-server && npm install && npm run dev

Terminal 2 (app):
  cd care-associate && npm install && npx expo start -c

Scan the QR code with Expo Go (phone and computer on the same WiFi).
Admin login: phone 9999999999 / password admin123 (change in care-associate-server/.env)
Server port is 5001. If you change PORT in .env, also change API_PORT at the top of care-associate/App.js.
# care-associate
