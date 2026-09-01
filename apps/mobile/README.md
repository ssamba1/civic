# Civic mobile

Civic mobile is the native Expo client for iOS and Android. It shares the
existing Civic Supabase project and server API, while keeping the Next.js
application unchanged.

## Prerequisites

- Node.js and pnpm versions compatible with the repository
- The repository dependencies installed from the repository root with
  `pnpm install`
- A running Civic web/API server
- Anonymous sign-in enabled in the existing Civic Supabase Auth settings
- For a physical device: Expo Go or a Civic development build, with the
  phone and development computer on the same network
- For local iOS builds: macOS with Xcode and an installed iOS Simulator
- For local Android builds: Android Studio, an SDK, and a running emulator
- For cloud development builds: an Expo account and EAS CLI

## Environment configuration

From `apps/mobile`, copy `.env.example` to `.env.local` and set:

```dotenv
EXPO_PUBLIC_CIVIC_API_URL=http://192.168.1.20:3000
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
```

Use the development computer's LAN address for a physical phone. `localhost`
on a phone means the phone itself. The iOS Simulator can normally use
`http://localhost:3000`; the standard Android Emulator reaches the host at
`http://10.0.2.2:3000`.

Only values intended to be public may use the `EXPO_PUBLIC_` prefix. Never put
a Supabase service-role key, Gemini key, signing credential, or other server
secret in this app. The Supabase anonymous/publishable key is public by design;
data access remains protected by authentication and RLS.

`EXPO_PUBLIC_PREVIEW_MODE=1` is only a local layout aid: it bypasses the sign-in
screen, does not provide a user session, and does not make backend reads or
report synchronization work. Keep it at `0` for integration tests and all EAS
builds. Every EAS profile hard-codes `0` so an account-level environment value
cannot accidentally create an auth-bypassing install.

Start the existing Civic API from the repository root:

```bash
pnpm dev
```

Then start Metro in a second terminal:

```bash
cd apps/mobile
pnpm start
```

If a phone cannot connect, confirm both devices are on the same network and
that the firewall permits Metro and port 3000. A tunnel can carry the Metro
connection, but the API URL must still be reachable by the phone.

## Run on a physical phone

### Expo Go

1. Install Expo Go from the iOS App Store or Google Play.
2. Run `pnpm start` in `apps/mobile`.
3. Scan the QR code with the iPhone camera or Expo Go's scanner on Android.
4. Allow camera, photo-library, and location access when prompted.

Expo Go is useful for quick UI and report-flow checks. Use a development build
for the release-representative native configuration, notification work, and any
native dependency not bundled into Expo Go.

### Development build

Run the initial EAS project configuration for the correct Expo account; it will
add the EAS project ID to `app.json`. Do not point this checkout at an unrelated
Expo project.

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest init
npx eas-cli@latest build --profile development --platform ios
npx eas-cli@latest build --profile development --platform android
```

The Android development profile produces an installable APK. The iOS physical
device build uses internal distribution and requires device registration and
Apple signing credentials. Install each build from its EAS build page, then run:

```bash
pnpm start -- --dev-client
```

Select the local development server from the installed Civic app.

For EAS cloud builds, create the three public variables in the EAS
`development` environment. They are embedded in the client and must not be
treated as secrets:

```bash
npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_CIVIC_API_URL --value https://reachable-api.example.org --visibility plaintext
npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value https://your-project.supabase.co --visibility plaintext
npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value your-public-key --visibility sensitive
```

Use a reachable HTTPS API for cloud-built clients. No EAS command in this
runbook submits to an app store. Do not create an EAS
`EXPO_PUBLIC_PREVIEW_MODE=1` value; the checked-in profiles explicitly override
that flag to `0` as a defense-in-depth measure.

## Run in simulators

With an iOS Simulator already installed:

```bash
cd apps/mobile
pnpm ios
```

With an Android emulator already running:

```bash
cd apps/mobile
pnpm android
```

For an EAS-built iOS Simulator binary:

```bash
npx eas-cli@latest build --profile simulator --platform ios
```

The simulator profile can also produce an Android emulator APK:

```bash
npx eas-cli@latest build --profile simulator --platform android
```

Camera behavior is simulated in emulators, so final privacy, permissions, GPS,
photo capture, persistence, and reconnect testing must happen on real devices.

## Checks

Run mobile checks from `apps/mobile`:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

`test:e2e` requires [Maestro](https://maestro.mobile.dev/) and an already
running authenticated build. See [e2e/README.md](e2e/README.md) for fixtures
and the deliberately limited coverage claim.

Also run the existing application checks from the repository root:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Physical-device acceptance test

Use at least one real iPhone and one real Android phone.

1. Continue with Civic's anonymous resident session or sign in with an existing
   Civic email account.
2. Enable airplane mode and fully close and reopen the app.
3. Capture a new photo and deny location once to exercise the map-tap fallback.
4. Save the report and record its displayed observation time and location.
5. Force-close and reopen the app. Confirm the report remains in History as
   waiting to sync.
6. Restore connectivity. Confirm automatic synchronization and a single server
   report with the same client ID, observation time, and location.
7. Force a lost-response retry (disconnect immediately after sending), reconnect,
   and confirm that retry still produces one server report.
8. Verify the public photo is redacted and that no raw photo is in the public
   bucket. Run `pnpm audit:privacy` from the repository root when credentials
   for that audit are available.
9. Check report confirmation, status, history, community map, assigned work,
   loading, empty, and error states. Confirm crew contact details never
   appear.

## Small-phone visual checks

Inspect every primary screen at these representative dimensions and in both
light and dark modes:

| Platform | Device | Logical viewport |
| --- | --- | --- |
| iOS | iPhone SE (3rd generation) | 375 × 667 pt |
| iOS | iPhone 13 mini | 375 × 812 pt |
| Android | Compact emulator | 360 × 640 dp |
| Android | Common handset | 360 × 800 dp |

At each size, increase system text size and verify safe-area clearance, no
clipped controls, keyboard avoidance, readable errors and loading states, map
interaction, and touch targets of at least 44 × 44 points. Record device/OS,
build ID, result, and screenshots in the pull request or release evidence.
