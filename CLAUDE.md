@agents.md

<!--
Everything above this line is the import. `agents.md` is the contract, and it
is deliberately cross-tool (Codex, Cursor, Copilot, Amp, Jules, Factory) — so
anything specific to Claude Code does not belong in it and belongs here.
-->

## Claude Code specifics

The rules are all in `agents.md`. This section is only the things that are
true of this tool and would be noise in a cross-tool file.

### `.claude/` is not documentation

`.claude/` holds real configuration that changes how a session behaves, and it
is easy to miss because nothing else in the repo references it:

- `.claude/skills/` — `loop-budget`, `loop-constraints`, `loop-triage`. These
  govern autonomous/scheduled runs, not ordinary interactive sessions.
- `.claude/agents/loop-verifier.md` — a checker subagent whose default stance
  is REJECT and which is required to run tests itself rather than trust a
  claim that they passed.
- `.claude/launch.json` — `pnpm dev`, port 3000, `autoPort` on.

See `.claude/README.md` for what is wired up and what is inert.

### Verify with the command CI runs

`pnpm lint` is `biome check src/` — scoped to `src/`, so it does **not** cover
`e2e/`, `tests/`, `supabase/seed/` or the root config files, and a clean
`pnpm lint` is not a clean `biome check .`. Never verify with
`biome check --write`: it fixes and then reports success, while CI runs
`biome check`, which reports and exits 1. That difference has already turned a
"verified" push into a red badge here (SUBMISSION.md, "What we learned" #5).

ESLint is installed and configured but is **not** wired to any script and does
not run in CI — Biome is the linter. `pnpm exec eslint .` works and reports
~238 findings that nothing gates on; treat them as advisory, not as a
regression you introduced.

### Two verifications this repo actually cares about

`pnpm test` passing is not evidence RLS holds — `tests/rls/*` is collected on
every run but stays in `skipIf` mode without a live database. Only
`pnpm test:rls` against a real one is evidence, and `agents.md` rule 3 requires
it before a schema change merges.

Likewise, a green build is not evidence a page works. Both of the worst bugs
this project has shipped (recorded in SUBMISSION.md) passed typecheck, lint,
the full unit suite and the production build, and were found by opening the app
and reading a screenshot. If a change touches a user-facing path, run it.
