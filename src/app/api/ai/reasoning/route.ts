import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { getReasoning } from "@/lib/ai/reasoning-ai";
import type { DashboardReport } from "@/lib/dashboard-data";
import {
  CATEGORY_META,
  CATEGORY_SLA_TARGETS,
  getReportCorpus,
} from "@/lib/dashboard-data";
import { getAuthUser } from "@/lib/db/ssr-client";

export interface ReasoningSection {
  title: string;
  value: string;
}

export interface ReasoningResponse {
  reportId: string;
  reasoning: string;
  costBreakdown: ReasoningSection[];
  scoringExplanation: ReasoningSection[];
}

export async function POST(request: Request) {
  try {
    // Auth check: accept either a valid user session OR an internal secret header.
    // The internal secret lets server actions and background jobs call this
    // without forwarding browser cookies.
    const user = await getAuthUser();
    const internalKey = request.headers.get("x-internal-key");
    const expectedKey = process.env.INTERNAL_CLASSIFY_SECRET;
    const isInternal =
      !!expectedKey &&
      !!internalKey &&
      internalKey.length === expectedKey.length &&
      timingSafeEqual(Buffer.from(internalKey), Buffer.from(expectedKey));

    if (!user && !isInternal) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit non-internal callers (browser users). Internal-key callers
    // (server actions, jobs) bypass — they are trusted and not user-facing.
    if (!isInternal) {
      const ip = clientIp(request);
      const rl = checkRateLimit(`reasoning:${ip}`);
      if (!rl.allowed) {
        const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
        return NextResponse.json(
          { error: "Rate limit exceeded. Please retry shortly." },
          { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
        );
      }
    }

    const body = await request.json();
    const reportId = body?.report_id;

    if (typeof reportId !== "string" || !reportId) {
      return NextResponse.json(
        { error: "report_id is required" },
        { status: 400 },
      );
    }

    const reports = getReportCorpus();
    const report = reports.find((r) => r.id === reportId);

    if (!report) {
      return NextResponse.json(
        { error: `Report not found: ${reportId}` },
        { status: 404 },
      );
    }

    // Hybrid sourcing: cache -> live Gemini -> deterministic template fallback.
    // getReasoning swallows any Gemini failure into the template path, so this
    // never dead-ends; the only non-200s above are intentional auth/limit gates.
    const { payload } = await getReasoning(
      {
        id: report.id,
        category: report.category,
        severity: report.severity,
        status: report.status,
        address: report.address,
        created_at: report.created_at,
      },
      CATEGORY_SLA_TARGETS[report.category],
      CATEGORY_META[report.category].label,
      () => templateReasoningForReport(report),
    );

    return NextResponse.json({ reportId, ...payload } as ReasoningResponse, {
      status: 200,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Unexpected error: ${message}` },
      { status: 500 },
    );
  }
}

function templateReasoningForReport(
  report: DashboardReport,
): Omit<ReasoningResponse, "reportId"> {
  const categoryMeta = CATEGORY_META[report.category];
  const slaHours = CATEGORY_SLA_TARGETS[report.category];
  const ageDays = Math.floor(
    (Date.now() - new Date(report.created_at).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  const estimatedCost = 12 + report.severity * 18;

  const costBreakdowns: Record<number, ReasoningSection[]> = {
    1: [
      {
        title: "Base Calculation",
        value: `$12 (base rate) + $${report.severity * 18} (severity multiplier) = $${estimatedCost} estimated total`,
      },
      {
        title: "Operational Complexity",
        value:
          "Minimal overhead, fully routine handling. No specialized protocols or inter-department coordination required.",
      },
      {
        title: "Crew & Resources",
        value:
          "Single technician dispatch with standard equipment. No specialists, heavy machinery, or contractor involvement anticipated.",
      },
      {
        title: "Timeline & Logistics",
        value: `Standard scheduling window, no overtime authorized. Batched with other low-priority ${categoryMeta.label.toLowerCase()} items for efficient route planning.`,
      },
      {
        title: "Impact Assessment",
        value:
          "Quick resolution expected within normal working hours. Minimal disruption to public services and low ongoing operational burden post-repair.",
      },
    ],
    2: [
      {
        title: "Base Calculation",
        value: `$12 (base rate) + $${report.severity * 18} (severity multiplier) = $${estimatedCost} estimated total`,
      },
      {
        title: "Operational Complexity",
        value:
          "Standard dispatch protocols apply. Predictable workflow with well-defined procedures—no novel coordination challenges.",
      },
      {
        title: "Crew & Resources",
        value:
          "Standard crew deployment with routine follow-up inspection. Minimal specialized equipment or contractor support anticipated.",
      },
      {
        title: "Timeline & Logistics",
        value: `Normal scheduling window, no urgent escalation. Standard contractor availability sufficient for ${slaHours}-hour SLA target.`,
      },
      {
        title: "Impact Assessment",
        value:
          "Manageable complexity keeps cost trajectory stable and predictable. No expected budget overruns or scope creep.",
      },
    ],
    3: [
      {
        title: "Base Calculation",
        value: `$12 (base rate) + $${report.severity * 18} (severity multiplier) = $${estimatedCost} estimated total`,
      },
      {
        title: "Operational Complexity",
        value:
          "Specialized response protocols required. Cross-department coordination increases administrative overhead and scheduling complexity.",
      },
      {
        title: "Crew & Resources",
        value:
          "Multi-team dispatch with specialized tools or equipment rental. Contractor involvement likely, adding procurement and oversight costs.",
      },
      {
        title: "Timeline & Logistics",
        value: `Accelerated scheduling to meet ${slaHours}-hour SLA. Potential overtime authorized if standard hours insufficient. Active monitoring through resolution.`,
      },
      {
        title: "Impact Assessment",
        value:
          "Coordination overhead and specialized equipment drive cost significantly above baseline. Public impact visible—community communication recommended.",
      },
    ],
    4: [
      {
        title: "Base Calculation",
        value: `$12 (base rate) + $${report.severity * 18} (severity multiplier) = $${estimatedCost} estimated total`,
      },
      {
        title: "Operational Complexity",
        value:
          "Urgent response with high public visibility and serious hazard implications. Requires incident management structure and real-time decision-making.",
      },
      {
        title: "Crew & Resources",
        value:
          "Priority dispatch with extended crew hours authorized. Equipment rental from external vendors likely. Contractor escalation on standby for scope overflow.",
      },
      {
        title: "Timeline & Logistics",
        value: `24-hour turnaround required, overriding normal scheduling queues. Continuous on-site monitoring until resolution confirmed. ${slaHours}-hour SLA is a ceiling, not a target.`,
      },
      {
        title: "Impact Assessment",
        value:
          "Significant stakeholder communications overhead—elected officials, press liaisons, and department heads may require briefings. Incident management coordination adds hidden labor cost.",
      },
    ],
    5: [
      {
        title: "Base Calculation",
        value: `$12 (base rate) + $${report.severity * 18} (severity multiplier) = $${estimatedCost} estimated total — actual costs may escalate substantially`,
      },
      {
        title: "Operational Complexity",
        value:
          "Emergency-level crisis demanding maximum resource mobilization. Full incident command structure activated. Cross-agency coordination with emergency services likely.",
      },
      {
        title: "Crew & Resources",
        value:
          "All-hands deployment with multiple contractor teams engaged simultaneously. Emergency equipment procurement bypasses standard bid process. 24/7 crew rotation required.",
      },
      {
        title: "Timeline & Logistics",
        value:
          "Immediate response, no queuing. Round-the-clock monitoring with shift supervisors. Operations continue until scene is fully stabilized—timeline is open-ended.",
      },
      {
        title: "Impact Assessment",
        value:
          "Leadership involvement mandatory. Emergency services liaison, media management, public safety advisories, and sustained multi-team coordination all contribute to total incident cost beyond direct repair.",
      },
    ],
  };

  const scoringExplanations: Record<number, ReasoningSection[]> = {
    1: [
      {
        title: "Classification",
        value:
          "Severity 1 — Minor issue with no immediate safety impact on residents or infrastructure integrity.",
      },
      {
        title: "Examples",
        value: `Cosmetic surface wear, minor efficiency degradation, non-critical ${categoryMeta.label.toLowerCase()} feature degradation that does not obstruct use.`,
      },
      {
        title: "Public Impact",
        value:
          "Minimal. Affects individual users or non-critical systems only. No risk of injury or service interruption at scale.",
      },
      {
        title: "SLA Target",
        value: `${slaHours} hours — standard maintenance window scheduling applies.`,
      },
      {
        title: "Response Strategy",
        value:
          "Batched with other Level-1 items for efficient crew routing. No dedicated dispatch—folded into scheduled maintenance runs.",
      },
      {
        title: "Escalation Trigger",
        value:
          "None anticipated. If unresolved past SLA or condition worsens, re-assess for severity upgrade to Level 2.",
      },
    ],
    2: [
      {
        title: "Classification",
        value:
          "Severity 2 — Noticeable issue affecting user comfort or creating minor service gaps without safety risk.",
      },
      {
        title: "Examples",
        value: `Moderate inconvenience to specific user groups, ${categoryMeta.label.toLowerCase()} conditions degraded but usable, time-limited issues (e.g., weather-dependent).`,
      },
      {
        title: "Public Impact",
        value:
          "Low. Affects specific locations or user subgroups. Not systemic—does not indicate broader infrastructure failure.",
      },
      {
        title: "SLA Target",
        value: `${slaHours} hours — resolved within routine dispatch cycle without emergency allocation.`,
      },
      {
        title: "Response Strategy",
        value:
          "Standard crew dispatch within normal workflow. Routine follow-up inspection scheduled post-repair to confirm resolution.",
      },
      {
        title: "Escalation Trigger",
        value:
          "If condition spreads to adjacent areas or user complaints increase, elevate to Severity 3 and trigger cross-team review.",
      },
    ],
    3: [
      {
        title: "Classification",
        value:
          "Severity 3 — Problem impacting public accessibility or approaching safety threshold. Requires prioritized attention.",
      },
      {
        title: "Examples",
        value: `Risk of minor injury if unaddressed, significant service disruption on high-traffic ${categoryMeta.label.toLowerCase()} routes, accessibility barriers for vulnerable populations.`,
      },
      {
        title: "Public Impact",
        value:
          "Moderate. Affects multiple users across a corridor or district. Transportation and accessibility concerns trigger ADA and equity review.",
      },
      {
        title: "SLA Target",
        value: `${slaHours} hours — accelerated relative to standard queue, with interim safety mitigation (cones, signage) deployed immediately.`,
      },
      {
        title: "Response Strategy",
        value:
          "Elevated dispatch priority with cross-team notification. Interim hazard mitigation deployed within 24 hours of report confirmation.",
      },
      {
        title: "Escalation Trigger",
        value:
          "Potential overtime if standard hours cannot meet SLA. Specialized crews placed on standby. If safety risk materializes, immediate upgrade to Severity 4.",
      },
    ],
    4: [
      {
        title: "Classification",
        value:
          "Severity 4 — Serious hazard with significant public impact. Represents widespread outage or imminent injury risk.",
      },
      {
        title: "Examples",
        value: `Immediate safety risk to pedestrians or vehicles, citywide ${categoryMeta.label.toLowerCase()} service disruption, hazardous conditions requiring area closure or detour.`,
      },
      {
        title: "Public Impact",
        value:
          "High. Affects large population segments across multiple neighborhoods. Media attention and elected official inquiries probable.",
      },
      {
        title: "SLA Target",
        value: `${slaHours} hours maximum — this is a ceiling. Internal target is 24-hour initial response with full resolution as rapidly as possible.`,
      },
      {
        title: "Response Strategy",
        value:
          "Expedited multi-team dispatch with real-time incident monitoring. Department director notified. Community alert issued if public safety is at risk.",
      },
      {
        title: "Escalation Trigger",
        value:
          "Incident command activated at time of dispatch. 24-hour response commitment initiated. If condition deteriorates, immediate upgrade to Severity 5 with emergency services coordination.",
      },
    ],
    5: [
      {
        title: "Classification",
        value:
          "Severity 5 — Life-safety emergency or catastrophic infrastructure failure. Highest response tier, all resources authorized.",
      },
      {
        title: "Examples",
        value: `Imminent risk of death or serious injury, total ${categoryMeta.label.toLowerCase()} infrastructure collapse, mass service disruption affecting emergency vehicle access or critical city systems.`,
      },
      {
        title: "Public Impact",
        value:
          "Severe. Citywide or regional crisis. Emergency services, public health officials, and executive leadership involvement required immediately.",
      },
      {
        title: "SLA Target",
        value: `${slaHours} hours is superseded — emergency escalation overrides standard SLA. Stabilization is the only acceptable outcome metric.`,
      },
      {
        title: "Response Strategy",
        value:
          "All available personnel mobilized immediately. Incident command structure stood up. Public safety advisories issued. Continuous executive briefings until resolved.",
      },
      {
        title: "Escalation Trigger",
        value:
          "Already at maximum tier. Emergency services liaison engaged. If fatalities or major injuries occur, transitions to post-incident review and liability assessment protocol.",
      },
    ],
  };

  const reasoning = `${categoryMeta.label} incident at ${report.address}. Severity ${report.severity}/5, age ${ageDays}d, status: ${report.status}. SLA: ${slaHours}h.`;

  return {
    reasoning,
    costBreakdown: costBreakdowns[report.severity] ?? costBreakdowns[3],
    scoringExplanation:
      scoringExplanations[report.severity] ?? scoringExplanations[3],
  };
}
