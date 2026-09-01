# tests/

This directory holds only the two suites that **cannot** live next to the code
they test. Everything else is co-located.

## Where the tests actually are

| Tier | Location | Runner | Count |
| --- | --- | --- | --- |
| Unit | `src/**/*.test.ts(x)`, beside the module | vitest (`pnpm test`) | 129 files |
| RLS integration | `tests/rls/` | vitest, opt-in (`pnpm test:rls`) | 13 suites |
| Classification eval | `tests/golden/` | `tsx` (`pnpm eval`) | manifest-driven |
| Browser smoke | `e2e/` | Playwright (`pnpm test:e2e`) | 7 specs |

Unit tests co-locate as `foo.test.ts` next to `foo.ts` — that is the convention,
and a new unit test filed in this directory is in the wrong place.

The two that live here do so because neither has a single module to sit beside:
RLS policies are a property of the *database*, and the eval measures a prompt
against a corpus rather than a function against inputs.

## The vitest include glob covers both

```ts
include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"]
```

So `pnpm test` **collects** `tests/rls/` on every run. It does not execute the
assertions: each suite stays in `skipIf` mode and passes unless a test database
is configured. That is deliberate — the everyday run stays hermetic and offline,
and CI stays green on a fork with no secrets.

The consequence to be clear-eyed about: **a green `pnpm test` is not evidence
RLS holds.** Only `pnpm test:rls` against a real database is, and that is what
`agents.md` rule 3 requires before a schema change merges.

Note also that `tests/**/*.test.ts` matches `.ts` only, so a `.tsx` file here
would be silently uncollected.

## Environment notes

`server-only` is aliased to `src/test/server-only-stub.ts`. Next.js's marker
package doesn't resolve in the node test environment, and without the stub any
server module is untestable in isolation. If a server module fails to import
under vitest, that alias is the first thing to check.

The test environment is `node`, not `jsdom`, even though `@vitejs/plugin-react`
is loaded for the handful of component tests.

## Details

Both subdirectories document themselves properly:

- **[`rls/`](./rls/README.md)** — what each suite covers and which env vars gate
  it. Two different gating conventions are in play (`RUN_RLS_TESTS=1` plus the
  `NEXT_PUBLIC_*` keys, versus the `SUPABASE_TEST_*` pair), so read the table
  before assuming a suite ran.
- **[`golden/`](./golden/README.md)** — the accuracy harness. Worth reading for
  the reason it exists: `verify-classify.mjs` uploads a 1×1 pixel and proves the
  pipeline *executes* while measuring zero accuracy, and `is_emergency`
  auto-dispatches, so an unmeasured miss rate is a liability question rather
  than a quality one. Images are git-ignored; the manifest is not.
