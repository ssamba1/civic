---
name: loop-constraints
description: >
  Read loop-constraints.md at the start of every run and enforce every rule.
  This skill runs BEFORE triage or any action skill. Constraints are binding.
user_invocable: true
---

# Loop Constraints Enforcer

You are the guardrail. Before any other work begins, you MUST:

1. Read `loop-constraints.md` from the project root **if it exists**. It does
   not exist in this repository today, and neither does the `docs/safety.md`
   this skill used to name as its fallback — so the defaults at the bottom of
   this file are the operative rules, not a stand-in for them. Do not report
   rules as loaded from a file you did not read.
2. Load every rule into your working memory.
3. Check if `loop-pause-all` is active → exit immediately.
4. Apply these rules to EVERY action that follows.

## How to enforce

- Before pushing: re-read the Push & Merge section. If ANY rule blocks it, stop and tell the human.
- Before editing a file: re-read the Paths section. If the path matches a denylist pattern, escalate.
- Before proposing a fix: re-read the Code section. Run tests. One fix per run.
- Before merging: re-read the Push & Merge section. Human must approve.

## Output at start of run

Always begin with a one-line confirmation that states where the rules came
from, accurately:

```
Constraints: N rules active (source: loop-constraints.md | skill defaults).
```

Never claim rules were "loaded from loop-constraints.md" when that file was
absent — a guardrail that reports a source it did not read is worse than one
that reports none.

## Interaction with other skills

- `loop-triage` — constraints may override triage priority (e.g. "don't push" means don't act on CI fixes)
- `loop-verifier` — constraints define denylist paths the verifier must check
- `loop-budget` — constraints may impose a stricter budget than its own defaults

(There is no `minimal-fix` skill in this repository; `.claude/skills/` holds
only the three loop skills. The "one minimal fix per run" rule below is the
thing that name used to stand for.)

## Default constraints

These are the operative rules unless a `loop-constraints.md` at the project
root overrides them. They are stated here rather than in a separate file so
that the guardrail cannot end up empty:

- Never edit `.env`, `.env.*`, `auth/`, `payments/`, `secrets/`, `credentials/`
- Never auto-merge to main
- Never disable, skip or delete a test to get green
- One minimal fix per run; escalate after 3 failed attempts

Plus this repository's own hard rules, which are not negotiable by a loop and
are stated in full in `agents.md`. The ones a loop is most likely to walk into:

- Never modify `src/lib/open311/`, `src/lib/privacy/blur.ts`, or anything under
  `supabase/migrations/` without an explicit ask (rule 10)
- Never introduce a path that calls a model from the client (rule 1) or that
  puts a raw photo in the public bucket (rule 2)
- A schema change is not done until `pnpm test:rls` passes against a real
  database (rule 3) — `pnpm test` alone is not evidence, it skips those suites
