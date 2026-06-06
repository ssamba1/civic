/**
 * System instruction: establishes the model's role and analytical lens.
 * Kept separate from the user prompt so the model treats it as persistent context.
 */
export const CLASSIFICATION_SYSTEM_PROMPT =
  `You are an expert municipal infrastructure analyst embedded in a city 311 reporting system. ` +
  `You inspect citizen-submitted photos and classify infrastructure problems so the right city ` +
  `crew is dispatched with the right priority. You are precise, consistent, and well-calibrated — ` +
  `you never inflate severity to appear thorough, and you never dismiss genuine hazards. ` +
  `Your classifications feed directly into work-order routing and emergency dispatch.`;

/**
 * User-facing classification prompt.
 * Sent alongside the inline photo as the task description.
 */
export const CLASSIFICATION_PROMPT =
  `Analyze the attached citizen photo and classify the infrastructure issue it depicts.

## CATEGORY — choose the single best match
- pothole            Road surface hole, depression, or severe cracking in asphalt/concrete roadway
- streetlight        Street or traffic light outage, broken fixture, or damaged/leaning pole
- downed_sign        Traffic or street sign fallen, missing, bent, or knocked off its post
- graffiti           Unauthorized markings on public surfaces: walls, sidewalks, benches, bridges
- illegal_dump       Household items, appliances, or bulk waste dumped on public land
- water_leak         Active main break, gushing hydrant, or pavement pooling from underground pipes
- sidewalk_damage    Heaved, sunken, cracked, or missing sidewalk or curb sections
- tree_down          Fallen or dangerously leaning tree / large branch on public property or roadway
- debris             Loose litter, construction waste, or scattered material on road or path
- drainage           Blocked storm drain, flooded roadway, or standing water from drainage failure
- faded_signage      Worn, sun-bleached, or barely-legible traffic/street signs still upright
- other              Any infrastructure issue that clearly does not fit the above categories

## SEVERITY SCALE (1–5)
1 — Cosmetic only. No safety risk. Routine maintenance cycle.
    Examples: light surface graffiti, minor paint fade, small surface scuff.
2 — Minor. No immediate hazard. Schedule repair within 1–2 weeks.
    Examples: pothole <5 cm deep, hairline sidewalk crack, one missing bollard.
3 — Moderate. Trip/tire hazard or actively worsening. Repair within 48–72 h.
    Examples: pothole 5–20 cm deep, heaved sidewalk panel, debris blocking bike lane.
4 — Significant. Injury or property-damage risk. Repair within 24 h.
    Examples: pothole >20 cm, downed sign in live lane, flooded intersection, broken streetlight after dark.
5 — Critical / life-safety. Dispatch immediately.
    Examples: active water-main flood, fallen tree blocking road, downed power line, open manhole.

## CONFIDENCE CALIBRATION
0.90–1.00  Issue is clearly visible, well-lit, and unambiguous.
0.70–0.89  Visible but partially obscured, poor lighting, or awkward angle.
0.50–0.69  Issue is inferred from context; image is blurry, distant, or unclear.
< 0.50     Too unclear to classify reliably — use category "other".

## HAZARD RADIUS (hazard_radius_m)
Estimate the radius in metres actively affected by this issue.
Use 0 for purely cosmetic issues.
Typical ranges: pothole 1–3 m · downed tree 10–30 m · water main break 20–100 m.

## OUTPUT — valid JSON only
No markdown. No code fences. No prose before or after the JSON. Every field required.

{
  "category": "<one of the 12 strings listed above>",
  "subcategory": "<3–7 words, e.g. 'deep asphalt pothole with exposed base' or 'broken streetlight arm over lane'>",
  "severity": <integer 1–5>,
  "hazard_radius_m": <non-negative number>,
  "visible_size_estimate": "<measurement or description, e.g. '~30 cm wide × 10 cm deep' or '4 m cracked sidewalk panel'>",
  "is_emergency": <true only when severity is 5 AND there is active, immediate danger to life or traffic>,
  "confidence": <float 0.00–1.00>,
  "reasoning": "<2–3 sentences: (1) describe what you observe in the image, (2) explain why this category and severity were chosen over alternatives, (3) note any visual factors that raise or lower your confidence>"
}`;
