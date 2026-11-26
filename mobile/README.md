# KiliCart customer mobile app

Expo SDK **58.0.26**, React Native **0.88.1**, React **19.3.0**, Expo Router **58.0.32**, and TypeScript **6.0.x**. SDK 58 is the stable Expo SDK selected for this app; its supported React Native and React versions are documented in the [Expo SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/).

## Configure the API

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL` to the API root ending in `/api/v1`. This variable is public app configuration, never put credentials or secrets in it.

| Target | Example |
| --- | --- |
| Android emulator | `http://10.0.2.2:5000/api/v1` |
| Physical Android device | `http://<computer-LAN-IP>:5000/api/v1` (same reachable network; allow the API port through the development firewall) |
| iOS simulator | `http://localhost:5000/api/v1` |
| Production | `https://<your-api-host>/api/v1` |

The API server must be reachable from the device and configured to serve the requested origin/network. Do not use `localhost` on a physical phone: it points to the phone itself. No default base URL is embedded in the app; a missing value shows a configuration error.

## Run and verify

From this directory:

```sh
npm install
npm start
npm run typecheck
npm test
npm run export
```

Use a development build or a compatible Expo Go release for SDK 58. Expo Go availability can vary by platform and store rollout; a development build is the reliable path for native testing.

Authentication uses the shared `/api/v1/auth` contract. Access tokens remain in process memory; rotating refresh tokens are stored through Expo SecureStore (iOS Keychain / Android secure storage). Public browsing does not require an account. Cart is only a Phase 2 placeholder.
