# Civic native mobile architecture

Status: implemented and locally verified, 2026-08-31

## Existing contracts

- Civic uses Supabase Auth and silently creates anonymous resident sessions on
  the web. Native supports the same guest-first path plus email sign-in and
  account creation; access and refresh tokens live in secure device storage.
- `src/app/report/actions.ts` owns validation, city resolution, storage writes,
  PII redaction, report insertion, classification, deterministic work-order
  generation, and crew dispatch. Mobile must delegate to this pipeline.
- Public images are privacy-processed before upload. Normalized originals go
  only to `photos-raw`, with restricted access and a 30-day retention policy.
- Civic currently has no durable native offline queue. The mobile workspace
  adds a SQLite queue without changing the database schema.

## Native report flow

1. Establish or restore a Supabase resident session, anonymously by default.
2. Capture/select a photo and immediately mint a UUID plus `occurredAt`.
3. Normalize the image on-device, create a conservative redacted public WebP,
   and keep the normalized JPEG in the app-private report folder.
4. Capture GPS; if unavailable, require a map tap or allow Civic's documented
   municipal-center fallback only after explicitly telling the resident.
5. Commit the complete queue record to SQLite before showing confirmation.
6. Drain oldest-first on startup, foreground, manual retry, and reconnection.
7. Deliver through `/api/reports/sync` with the resident bearer token. The route
   delegates to `submitReport`, preserving Civic's AI and dispatch rules.
8. Delete local files only after a successful response containing the same
   client UUID. Retries reuse the UUID and original observation timestamp.

## Boundaries

- No Gemini or dispatch logic runs in the app.
- No raw image is written to a public bucket.
- No volunteer or municipal employee contact data is selected.
- No database migration is required.
- The client contains only the Civic API origin, Supabase URL, and Supabase
  anonymous/publishable key. Server, service-role, AI, and signing secrets stay
  outside the bundle.
- Push-token acquisition is prepared, but persistence requires a separately
  approved schema/API decision.

## Verification plan

- Unit-test timestamp preservation, owner isolation, retry ceilings, concurrent
  drains, network interruption, authentication deferral, and duplicate safety.
- Exercise the complete report flow with Maestro on iOS and Android when native
  toolchains are available.
- Run mobile TypeScript, Biome, Jest, Expo Doctor, and both platform exports.
- Treat process-restart SQLite persistence, camera/GPS permissions, public/raw
  storage inspection, and offline-to-online exactly-once delivery as mandatory
  physical-device acceptance tests.
