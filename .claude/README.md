# .claude/

Claude Code configuration. Five files, and the important thing to know before
reading them is that **most of what is here is inert**.

```
skills/loop-budget/SKILL.md       spend guard for autonomous runs
skills/loop-constraints/SKILL.md  guardrail enforcer, runs before any action
skills/loop-triage/SKILL.md       produces a prioritised findings report
agents/loop-verifier.md           maker/checker: rejects unless tests pass
launch.json                       `pnpm dev`, port 3000, autoPort
```

## The loop skills are a scaffold, not a running system

All three were written for an autonomous loop that reads its budget, its
constraints and its state from files in the repository root. **None of those
files exist.** Every one of these was a dangling reference:

| Referenced by | Path | Status |
| --- | --- | --- |
| `loop-budget` | `loop-budget.md` | never existed |
| `loop-budget` | `loop-run-log.md` | never existed |
| `loop-constraints` | `loop-constraints.md` | never existed |
| `loop-constraints` (fallback) | `docs/safety.md` | never existed |
| `loop-constraints` | the `minimal-fix` skill | never existed |

That matters most for `loop-constraints`, because its whole job is to be the
guardrail: "Read `loop-constraints.md` from the project root. Load every rule.
Apply these rules to EVERY action that follows." With no file to read, it fell
through to "default safety rules from `docs/safety.md`" — which is also
missing. A guardrail whose rule source and whose fallback rule source are both
absent is not a strict guardrail; it is an empty one, and the instruction to
open with `Constraints loaded from loop-constraints.md: N rules active.` made
it *look* like it had loaded something.

The skills now state their defaults inline instead of pointing at files that
are not there, so the safe behaviour is in the skill rather than in a document
someone still has to write. If a real loop is set up later, adding
`loop-constraints.md` at the root overrides them.

## What does work

`agents/loop-verifier.md` is self-contained and usable today. It is the checker
half of a maker/checker split: default stance REJECT, must run the tests itself
rather than believe a claim that they passed, and escalates to a human when it
cannot run them. Nothing about it depends on the missing files.

`launch.json` is a plain debug config — `pnpm dev` with `autoPort`, so it
sidesteps the port-3000 collision that `playwright.config.ts` and `e2e/README.md`
both warn about.

## Scope

Claude-Code-only. The cross-tool contract is `agents.md` (loaded here through
`CLAUDE.md`'s `@agents.md` import); Claude-Code-specific notes that would be
noise in a cross-tool file live in `CLAUDE.md` below that import. Nothing in
this directory overrides a hard rule in `agents.md`.
