# Mobile integration tests

The Maestro flow in `report-flow.yaml` is an on-device smoke test for Civic's
guest-first launch, photo selection, local-save confirmation, and navigation to History. It
complements the Jest sync tests; it does not replace the real-device offline
acceptance test in the mobile README.

## Prerequisites

- A simulator/emulator or physical device with Civic installed and running
- The Civic API reachable from that device
- Anonymous sign-in enabled in the configured Supabase project
- A photo named so it can be selected by the platform picker
- Maestro installed and available as `maestro`
- `EXPO_PUBLIC_PREVIEW_MODE=0`; preview mode bypasses the sign-in screen and is
  not an integration-test environment

Set the fixture label without using a real resident photo:

```bash
export E2E_PHOTO_LABEL='issue-fixture.jpg'
```

Run from `apps/mobile`:

```bash
pnpm test:e2e
```

Platform photo pickers differ and are outside the application process. If the
fixture label is not exposed by the picker, select the prepared issue image
manually and resume the flow. Never use a real resident photo as a test fixture.

## Coverage and limitations

The smoke flow verifies the UI reaches its local-save confirmation. When the
device is online, synchronization may remove the queue row before History is
opened, so the flow deliberately does not assert `WAITING TO SYNC`. Offline
reconnect, process-death restoration, capture-time preservation, duplicate
prevention after a lost response, camera permissions, GPS denial, map-tap
fallback, server delivery, and public-bucket privacy require the physical-device
acceptance procedure in `../README.md` until deterministic native service
fixtures are added. Do not report those cases as automated based only on this
flow.
