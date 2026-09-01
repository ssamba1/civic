# public/

Statically served at the site root. `public/foo.webp` is `/foo.webp`.

Almost everything here is **generated**, and the generator is the source of
truth. Editing an output by hand works right up until someone re-runs the
script, so if an image is wrong, fix the script.

## Provenance

| Path | Produced by | Notes |
| --- | --- | --- |
| `landing-shots/` | `scripts/shot-readme.mjs`, `scripts/capture-hero-map.mjs` | Product screenshots for the landing page. |
| `landing-clay/` | `scripts/gen-clay.mjs` | The claymorphism set for the bento hero. |
| `landing-clay/_raw/` | same | Pre-compression JPEG sources. Kept so the `.webp` set can be re-encoded without re-generating. Not served. |
| `cesium/` | `scripts/copy-cesium-assets.mjs` | **Git-ignored.** Cesium's prebuilt runtime, copied out of `node_modules` so the browser can fetch it at `CESIUM_BASE_URL`. Runs on `postinstall` and `prebuild`. A fresh clone has no `cesium/` until install. An empty globe usually means this didn't run. |
| `camera-demo/`, `demo/` | `services/detector` | Detector output for the seeded clip. |

`landing-shots/hero-map.jpg` earns its place: it is a baked plate of the live
map, so the landing page ships an image instead of ~1.85 MB of maplibre-gl and
deck.gl on every visit.

## Known defect: the PWA icons are missing

`manifest.json` declares:

```json
{ "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
{ "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
```

**`public/icons/` does not exist**, and no `icon-*.png` exists anywhere under
`public/`. Both references 404.

The manifest is otherwise valid, so the app still installs. Add to Home Screen
just falls back to a browser-generated icon rather than the wordmark. It fails
quietly, which is why it has survived: nothing in CI fetches manifest icon URLs,
and a Lighthouse PWA audit is not part of the documented gates.

Fixing it means adding a 192 px and a 512 px PNG at those paths, or correcting
the manifest to point at assets that exist. Not done here because this pass is
documentation; recorded so it stops being invisible.

## Hand-maintained files

These are the exception. No script owns them:

- `manifest.json`: PWA manifest. `start_url` is `/report`, which is the right
  call: someone installing this to their home screen is installing a camera, not
  a dashboard.
- `sw.js`: service worker. Backs the `/offline` fallback page. It is a fallback
  *page*, not offline capture; a resident with no signal still cannot file.
- `next.svg`, `vercel.svg`, `window.svg`, `globe.svg`, `file.svg`: Next.js
  starter leftovers. Nothing in `src/` references them; safe to delete.
- `video-detection-placeholder.svg`, `open311-external-placeholder.svg`: shown
  where a real asset is absent.

## Weight

`camera-demo/bus-feed.mp4` is 5.8 MB and committed, the largest file in the
repository, and the reason a clone is bigger than the source warrants. It is the
demo clip the video console plays, so it has to be somewhere; a release asset or
object storage would be the better home if this outgrows a hackathon repo.

`.gitignore` already excludes `/public/demo/*.mp4` and `/public/cesium/`. New
binaries here should get the same treatment unless a reviewer genuinely needs
them in-tree.

## Rules

- **Nothing secret.** This directory is world-readable by definition, with no
  auth in front of it. No resident photo, no report data, no key. The
  `photos-public` and `photos-raw` buckets exist precisely so uploads never land
  here.
- Prefer `.webp` for photographic assets; the clay set and landing shots are all
  webp for this reason.
- Reference assets by absolute path (`/landing-shots/shot-map.webp`). Relative
  paths break on nested routes.
