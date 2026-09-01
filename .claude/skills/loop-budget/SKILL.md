---
name: loop-budget
description: Check token budget and run-log spend before and after a loop run. Enforces early exit when over budget or when there is no actionable work.
---

# Loop Budget Guard

Run at the **start** and **end** of every loop iteration.

> **Neither control file exists in this repository yet.** `loop-budget.md` and
> `loop-run-log.md` are both absent, so steps 1–3 have nothing to read and the
> spend checks in 4–5 cannot fire. Until they are created, the operative rule
> is step 6 plus the defaults below — and a run must not report a budget it
> did not measure. Creating `loop-budget.md` at the project root switches
> steps 1–5 on.

## Start of run

1. Read `loop-budget.md` for daily caps and kill-switch flags.
2. Read recent entries in `loop-run-log.md` (last 24h).
3. Sum `tokens_estimate` for the active pattern today.
4. If spend ≥ 80% of the pattern's daily cap → **report-only mode** (no sub-agents, no auto-fix).
5. If spend ≥ 100% or `loop-pause-all` is set → **exit immediately** with a one-line note in STATE.md.
6. If watchlist/state has no actionable items → **exit in <5k tokens** (do not spawn sub-agents).

## Defaults with no `loop-budget.md`

- Report-only. Propose fixes; do not push.
- At most 2 sub-agent spawns per run.
- Exit immediately when nothing is actionable — this is the whole cap when
  there is no ledger to check against.

## End of run

Append one JSON object to `loop-run-log.md`, creating it if absent:

```json
{
  "run_id": "<ISO8601>",
  "pattern": "<pattern-id>",
  "duration_s": <number>,
  "items_found": <number>,
  "actions_taken": <number>,
  "escalations": <number>,
  "tokens_estimate": <number>,
  "outcome": "no-op | report-only | fix-proposed | escalated"
}
```

## Rules

- Never exceed `max sub-agent spawns/run` from `loop-budget.md`, or the default
  of 2 when that file is absent.
- High-cadence patterns (CI Sweeper, PR Babysitter) **must** early-exit when nothing is actionable.
- On self-throttle, append a line to `loop-budget.md` under **Alerts This Period**, if it exists.