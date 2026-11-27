# Expo Go testing

The mobile client is tested interactively by the project owner in Expo Go. From the repository root:

```bash
cd mobile-app
npm install
npx expo start -c
```

Scan the QR code with Expo Go on the test device. Use a reachable HTTPS API or the development machine's LAN IP in the app API configuration; `localhost` on a physical phone points to the phone itself.

Expo Go can validate normal screens and API-backed workflows. Cashfree checkout uses a native module and is not available in standard Expo Go. Background location and full remote-push behavior also require a native development build and device-specific setup. Those flows must not be marked as tested solely from Expo Go.

GitHub Actions runs dependency checks, Android prebuild/export validation and Expo Doctor; it does not create an APK.
