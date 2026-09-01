# SOC 2 Type II Readiness (NEXT_100 #94)

> Gap assessment mapping Civic's existing technical controls to the SOC 2 Trust Services Criteria (TSC). This is the pre-audit artifact: what's in place, what's missing, and the path to a Type II report. Not a certification.

## Why SOC 2 first
Table-stakes for municipal procurement above the smallest tier. A Type II report (controls operating effectively over 6-12 months) unlocks most of the mid-market pipeline.

## Control mapping: in place

| TSC | Criterion | Civic control | Evidence |
|-----|-----------|---------------|----------|
| CC6.1 | Logical access | Row-level security, default-deny, on every table | `tests/rls/` regression suite; migrations |
| CC6.1 | Least privilege | Service-role confined to server; anon/auth scoped by RLS | `lib/db/*`, RLS policies |
| CC6.6 | Boundary protection | No secrets in client env; AI keys server-only | agents.md hard rules; `lib/env.ts` |
| CC6.7 | Data in transit | HTTPS only; no PII in URLs/query strings | agents.md rule 4 |
| CC7.2 | Monitoring | Append-only `audit_log` on reports/work_orders/storage | migration 001 audit triggers |
| CC7.3 | Incident detection | Sentry error capture; `error_log` table | `sentry.*.config.ts` |
| C1.1 | Confidentiality | Face/plate blur pre-upload; raw bucket restricted + 30-day TTL | `lib/privacy/blur.ts`, `lib/privacy/retention.ts` |
| P (privacy) | Data minimization | Anonymous reporting; opaque status tokens | `/r/[token]`, `lib/public-report.ts` |

## Gaps to close before audit

1. **Access review**: no periodic (quarterly) review of who has DB/admin access. *Action:* documented review + evidence log.
2. **Change management**: commits + PRs exist, but no formal change-approval record tying deploys to reviews. *Action:* enforce PR review + protected `main`; retain records.
3. **Vendor management**: Supabase, Gemini, Resend, Twilio are subprocessors. *Action:* subprocessor list + DPAs.
4. **Availability / BCP**: no documented backup/restore + RTO/RPO. *Action:* runbook + tested restore (see `docs/runbooks/`).
5. **Onboarding/offboarding**: no formal access provisioning checklist. *Action:* HR + access checklist.
6. **Risk assessment**: no annual documented risk assessment. *Action:* template + first pass.
7. **Pen test**: none on record. *Action:* schedule third-party test; the branch security-review skill covers interim.

## Path
1. Adopt a compliance platform (Vanta/Drata/Secureframe) to automate evidence.
2. Close the 7 gaps above (mostly process/docs, ~1 quarter).
3. Type I (point-in-time) → begin the Type II observation window (6 months).

## Owner / status
Controls summary is surfaced in-app at `/admin/compliance` (#98). This doc is the internal gap tracker; update as gaps close.
