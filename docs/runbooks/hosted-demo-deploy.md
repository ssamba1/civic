# Deploy the hosted demo

Two paths. Both end with the same check, and the check is the point: **a
deployment that boots and looks fine can still be dead**, because a missing
service-role key renders several pages empty and healthy-looking. Do not share
the URL before `/api/health` answers.

## The eleven variables

Nine are required. Miss one of the first three and the app throws on the first
request; miss `DEMO_COOKIE_SECRET` and demo sign-in fails **closed** — a viewer
types the password, is accepted, and lands nowhere.

| Variable | Value | Why it is not optional |
|---|---|---|
| `SUPABASE_URL` | from `.env.local` | |
| `SUPABASE_SERVICE_ROLE_KEY` | from `.env.local` | Server-only. Never a `NEXT_PUBLIC_*` var |
| `GEMINI_API_KEY` | from `.env.local` | |
| `NEXT_PUBLIC_SUPABASE_URL` | from `.env.local` | Needed at **build** time, not just runtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from `.env.local` | Build time |
| `RATE_LIMIT_TRUSTED_HEADER` | `x-real-ip` | **Server env validation THROWS in production without it.** Vercel sets this header itself and strips a client-supplied one, so it is the only one the rate limiter can trust |
| `PUBLIC_TOKEN_SALT` | a long random string | **Throws in production without it.** Report ids are public through the Open311 API, so the built-in default salt would let anyone derive every resident's `/r/<token>` status URL |
| `DEMO_COOKIE_SECRET` | a long random string | Signs the demo persona cookie. Unset ⇒ no persona resolves anywhere, including staff surfaces |
| `INTERNAL_CLASSIFY_SECRET` | from `.env.local`, or any long random string | |
| `NEXT_PUBLIC_DEMO_MODE` | `1` | The seeded corpus and personas a visitor needs. Build time |
| `VIDEO_PIPELINE` | `1` *(optional)* | Without it `/city/[slug]/video` 404s. The console renders from seeded rows; ingest additionally needs `VIDEO_DETECT_MODEL_PATH`, which is not required for the demo |

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Path A — the script (one command after login)

```bash
npx vercel login
npx vercel link
node scripts/deploy-vercel.mjs --prod
```

It reads `.env.local`, mints `PUBLIC_TOKEN_SALT` and `DEMO_COOKIE_SECRET` if
they are not already there, writes them to a gitignored
`.env.production.local` so a redeploy reuses the same values — regenerating the
salt would invalidate every status link already shared — pushes all eleven, then
deploys.

## Path B — the Vercel dashboard (if you connect the GitHub repo instead)

Most people take this path, and it is the one that silently half-works.

1. Import `ssamba1/civic`. Framework preset: **Next.js**. Leave build and output
   settings alone.
2. **Add every variable above before the first build.** The four
   `NEXT_PUBLIC_*` ones are inlined at build time, so adding them afterwards
   requires a *redeploy*, not just a restart — a "Redeploy" with the existing
   build cache will not pick them up.
3. Deploy.

## The check that matters

```bash
curl https://<your-deployment>/api/health
# {"status":"ok","checks":{"database":true,"ai":true}}
```

`database: false` means the service-role key is wrong or missing. `ai: false`
means the Gemini key is. Either way several pages will still render — emptier
than they should be, with no error — which is exactly the failure that fools a
rehearsal.

Then walk three URLs, because each proves a different half of the product:

| URL | Proves |
|---|---|
| `/` | The landing map renders and the app is styled (if Tailwind did not build, this is where you see it) |
| `/city/cumming` | The staff dashboard, with real counts from the database |
| `/report` | The resident flow, camera-first |

Sign in at `/login` with `admintest` / `admintest` to confirm the persona cookie
is signed — if `DEMO_COOKIE_SECRET` is missing, this is where it fails, and it
fails by accepting the password and going nowhere.

## After it is up

- Put the URL at the top of `README.md`. The honest-limits section says a hosted
  demo exists **only if a URL is linked there**, so the claim self-corrects the
  moment you add it.
- Set it as the repository's Website field.
- If `/r/<token>` links are to work on the deployment, run `pnpm db:tokens`
  against the same database — the seeded rows have no status token until you do.
