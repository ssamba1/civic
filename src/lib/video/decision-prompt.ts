/**
 * Prompt for the stage-2 decision run. The model sees the best evidence frame
 * plus a compact JSON context block of everything the city already knows,
 * nearby report history, SLA targets, the crew catalog, past staff
 * corrections, and must return a cited decision, not a bare classification.
 */

export const DECISION_SYSTEM_PROMPT =
  `You are a municipal public-works review officer. An automated road-scanning ` +
  `system has flagged possible infrastructure damage from a city camera feed. ` +
  `Your job is to DECIDE what the city should do about it, using the photo ` +
  `evidence AND the city context you are given (open reports nearby, service ` +
  `level targets, available crews, past classification corrections). You are ` +
  `accountable for this decision: every material claim must cite the context ` +
  `item it rests on. You are well-calibrated. You neither rubber-stamp weak ` +
  `detections into work orders nor dismiss genuine hazards.`;

export interface DecisionContext {
  detection: {
    cluster_id: string;
    detector_class: string;
    max_confidence: number;
    frame_count: number;
    location: { lng: number; lat: number } | null;
  };
  nearby_reports: {
    id: string;
    category: string | null;
    address: string | null;
    distance_m: number;
    created_at: string;
  }[];
  sla_hours_by_category: Record<string, number>;
  crew_types: { key: string; description: string }[];
  correction_history: {
    original_category: string;
    corrected_category: string;
    n: number;
  }[];
}

export function buildDecisionPrompt(context: DecisionContext): string {
  return `Review the attached camera frame and the machine detection summary, then decide the city's action.

## DECISIONS
- dispatch, real, actionable damage with no existing open report covering it. Creates a work order.
- merge, the SAME physical issue as one of the NEARBY REPORTS below. Set merge_report_id to that report's exact id and cite it. Never merge into a report of a clearly different issue.
- monitor, plausibly real but not yet actionable (too minor, evidence too weak to justify a crew). The system keeps accumulating detections at this location.
- dismiss, false positive: shadow, patch/repair scar, wet pavement, lane marking, debris that is not damage.

## RULES
- The photo is the primary evidence; the detector's class and confidence are hints, not truth.
- Cite context ids: every nearby-report claim cites source "nearby_report" with the report id; SLA claims cite "sla_target"; crew claims cite "crew_catalog"; the frame itself is "detection_evidence" with the cluster id.
- If PAST CORRECTIONS show this city's staff repeatedly re-classify the category you would pick, weigh that before choosing.
- severity uses the city's 1-5 scale (1 cosmetic … 5 life-safety). cost_band is your rough repair-cost expectation.
- Be conservative with "dispatch" below detector confidence 0.5 unless the photo alone is unambiguous.
- merge_report_id MUST be null unless decision is "merge".

## CITY CONTEXT
${JSON.stringify(context, null, 2)}

## OUTPUT, valid JSON only, every field required
{
  "decision": "<dispatch|merge|monitor|dismiss>",
  "category": "<report category this damage maps to>",
  "severity": <integer 1-5>,
  "confidence": <float 0.00-1.00, your confidence in the DECISION>,
  "rationale": "<2-4 sentences: what the frame shows, why this decision over the alternatives, and what context tipped it>",
  "merge_report_id": "<exact nearby report id, or null>",
  "cost_band": "<under_500|500_2500|2500_10000|over_10000>",
  "citations": [ { "source": "<detection_evidence|nearby_report|sla_target|crew_catalog|correction_history>", "ref": "<id or key>", "note": "<what this supports>" } ]
}`;
}
