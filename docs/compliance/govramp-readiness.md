# GovRAMP (StateRAMP) Ready: Readiness Note (NEXT_100 #95)

> Orientation for pursuing GovRAMP "Ready" status, the next procurement gate after SOC 2 for state/local grant-funded deployments. This is a scoping note, not an authorization package.

## What GovRAMP is
GovRAMP (formerly StateRAMP) applies the NIST SP 800-53 control baseline to cloud products serving state & local government, with an independent 3PAO assessment. Statuses progress: **Ready → Authorized**. "Ready" signals a minimum security posture and a committed remediation path.

## Relationship to SOC 2
SOC 2 (see [soc2-readiness.md](./soc2-readiness.md)) covers much of the overlap (access control, monitoring, incident response, encryption). GovRAMP adds a formal NIST 800-53 control mapping, a System Security Plan (SSP), and a POA&M (Plan of Action & Milestones). Do SOC 2 first; reuse its evidence.

## Baseline & scope
- Target baseline: **Low Impact** initially (public 311 data is largely non-sensitive; PII is minimized, blurred photos, opaque tokens, no PII in URLs). Reassess to Moderate if a tenant stores sensitive categories.
- Boundary: Next.js app + Supabase (Postgres/Auth/Storage) + subprocessors (Gemini, Resend, Twilio, Sentry).

## Prerequisites (largely shared with SOC 2)
1. System Security Plan (SSP) documenting the boundary + data flows.
2. NIST 800-53 (Low) control implementation statements. Map from the SOC 2 control set.
3. POA&M for open items (the 7 SOC 2 gaps seed this).
4. Continuous monitoring plan (Sentry + audit_log + retention sweep already provide telemetry).
5. Subprocessor / supply-chain inventory with FedRAMP/GovRAMP status of each (Supabase, etc.).

## Sequence
1. Finish SOC 2 Type I (fastest credibility signal).
2. Author the SSP + 800-53 Low mapping (reuse SOC 2 evidence).
3. Engage a GovRAMP 3PAO for the Ready assessment.
4. Submit for **Ready**; drive POA&M to pursue **Authorized**.

## Status
Not started, gated on SOC 2 progress and a target state customer to justify the (XL) effort. Tracked here so it isn't rediscovered from scratch.
