# pitch/

One file: `index.html`, a 627-line self-contained pitch deck. Twelve slides,
from "Cities run on a broken 311" through market sizing and pricing to the
accountability-layer close.

## It is not part of the app

Nothing in `src/` imports it, nothing in `next.config.ts` references it, and it
is **not** under `public/`, so Next.js does not serve it. `pnpm build` ignores
this directory entirely.

Open it directly:

```bash
open pitch/index.html        # macOS
xdg-open pitch/index.html    # Linux
```

No build step, no dependencies, no dev server. Everything (styles, markup, any
script) is inline in the single file, which is the point: a deck that needs a
toolchain to open is a deck that fails in the room.

## Don't confuse it with `civic-deck/`

`agents.md` mentions a sibling `Civic/civic-deck/`: a separate Vite project,
outside this repository, that is also a pitch deck. This file is the standalone
fallback version. They are different artifacts with overlapping content, and
neither is generated from the other, so a change to the story has to be made in
both or deliberately in one.

## Editing

Hand-edited HTML. There is no generator, so the usual caution about `public/`
does not apply here. This file *is* the source.

Keep it single-file. The moment it grows an external stylesheet or an image
directory it stops being portable, which is the only property it has that
`civic-deck/` doesn't.

Figures quoted in the slides (market size, per-report cost, conformance claims)
should agree with `README.md` and `docs/planning/context.md`. They have drifted
apart before, when you update a number in one, grep for it in the others.
