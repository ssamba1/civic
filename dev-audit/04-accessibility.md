# Accessibility Audit, Civic Outreach App

**Date:** 2026-06-13  
**Scope:** All src/**/*.tsx components (202 files)  
**Method:** Read-only sweep across 6 accessibility categories

---

## Summary

**Total findings:** 23 issues  
**P0 (broken/unsafe):** 4  
**P1 (should fix):** 16  
**P2 (nice-to-have):** 3

**Most critical issue:** Report photo thumbnails marked as decorative (lt="") when they contain essential content. Staff cannot identify issues via image alone when alt text is missing.

---

## Key Findings

| ID | File:Line | Severity | Problem | Fix |
|----|-----------|-----------|---------|----|
| A1-A3 | work-order-row.tsx: 242, 322, 510 | P0 | Report photos with empty alt="" | Add descriptive alt text |
| A4 | report/page.tsx:406 | P0 | Address input: no label | Add <label> or ria-label |
| A5-A6 | login-form.tsx: 215, 225 | P0 | Email/password: no labels | Add <label> or ria-label |
| A7-A8 | city-switcher.tsx:120, staff-inbox.tsx:378 | P1 | Search inputs: no aria-label | Add ria-label |
| A9 | staff-inbox.tsx:376 | P1 | Search icon: not aria-hidden | Add ria-hidden="true" |
| A10-A11 | photo-preview.tsx:228, work-order-comments.tsx:150 | P1 | Textareas: no labels | Add <label htmlFor> |
| A12 | team-tasks-interactive.tsx:221 | P0 | Image with alt="" | Add descriptive alt |
| A13-A21 | 9 locations | P1 | Clock icons: not aria-hidden | Add ria-hidden="true" |
| A22 | button.tsx:25 | P2 | Icon buttons: no label enforcement | Add JSDoc warning |
| A23 | login-form.tsx:290 | P2 | Focus visibility: subtle on desktop | Test keyboard nav |

---

## P0 Issues (Blocking)

### Report Photos with Empty Alt Text (A1, A3, A12)

Staff cannot identify issues without alt text. Affects work order review, triage, and decision-making.

**Pattern (work-order-row.tsx:242):**
`	sx
<Image src={report.photo_public_url} alt="" fill className="object-cover" sizes="56px" />
`

**Fix:** Add contextual description:
`	sx
<Image 
  src={report.photo_public_url} 
  alt={Report: $'{classification.category.replace('_', ' ')} at ${report.address || 'unknown'}} 
  fill 
  className="object-cover" 
/>
`

---

### Form Inputs Without Labels (A4, A6)

Placeholders are not labels. Screen reader users have no context; users cannot file reports or log in.

**Locations:**
- report/page.tsx:406, Address input (GPS fallback)
- login-form.tsx:215, Email input
- login-form.tsx:225, Password input

**Fix:** Add proper <label> elements or ria-label attributes.

---

## P1 Issues (Should Fix)

### A7, A8: Search Inputs Without aria-label
city-switcher.tsx:120 and staff-inbox.tsx:378 have search inputs with only placeholder text. When users type, placeholder vanishes and context is lost.

**Fix:** Add ria-label="Search municipalities" and ria-label="Search work orders by address or category".

---

### A9: Search Icon Without aria-hidden
staff-inbox.tsx:376, Decorative Search icon announced redundantly.

**Fix:** Add ria-hidden="true".

---

### A10, A11: Textareas Without Labels
- photo-preview.tsx:228. Issue description textarea
- work-order-comments.tsx:150, Comment textarea

Screen reader users cannot identify the textarea purpose.

**Fix:** Add <label htmlFor> wrapper.

---

### A13, A21: Decorative Clock Icons (9 instances)
Clock icons throughout the app (work order rows, analytics, maps) are announced redundantly by screen readers.

**Locations:** work-order-row.tsx (203, 367, 471), work-order-detail.tsx (373), analytics/report-detail.tsx (427), analytics/reports-explorer.tsx (132), dashboard/recent-reports.tsx (190), map/fullscreen-map.tsx (530), teams/delegation-panel.tsx (327).

**Fix:** Add ria-hidden="true" to all.

---

## P2 Issues (Nice-to-Have)

### A22: Icon Button Label Enforcement (button.tsx:25)
Component accepts size="icon" but doesn't enforce ria-label. Icon buttons in the app DO have labels (good), but this is convention, not validated.

**Fix:** Add JSDoc:
`	sx
/** Icon-only button. MUST include aria-label prop for accessibility. */
size?: "icon";
`

---

### A23: Focus Visibility on Desktop (login-form.tsx:290)
Focus ring may be subtle when tabbing on desktop. Test keyboard navigation; ensure ocus-visible:outline is visible.

---

## Well-Implemented Patterns ✓

- **Modals/Drawers:** Full ARIA (role="dialog", aria-modal, Esc, focus traps)
- **Accordion:** Radix UI, full keyboard support
- **Buttons:** focus-visible outline, aria-busy on async
- **Dropdowns:** aria-haspopup, aria-expanded, aria-controls
- **Keyboard navigation:** role="button" disclosure proper Enter/Space handling
- **Notifications:** Icons marked aria-hidden, aria-label on indicators
- **Analytics:** aria-labels on interactive chart elements

---

## Recommended Actions

### Tier 1 (Ship-Blocking)
1. Fix report photo alts (A1, A2, A3, A12). Staff workflow blocker
2. Add labels to form inputs (A4, A5, A6). Resident workflow blocker
3. Add aria-label to search inputs (A7, A8)

### Tier 2 (Fix Soon)
4. Label textareas (A10, A11)
5. Mark decorative icons aria-hidden (A9, A13, A21)

### Tier 3 (Polish)
6. Document icon-button convention (A22)
7. Test focus visibility (A23)

---

## Effort & Impact

**Effort:** Low. Most fixes are 1-3 line changes (add label, add aria-label, add aria-hidden).

**Impact:** High. P0 issues block critical user flows:
- Residents cannot file reports (login, address, description fields blocked)
- Staff cannot review issues (photos not identifiable)

**Violations:** WCAG 2.1 Level A, form labels, image alt text.

---

## Testing (Not in Scope, Requires Manual Verification)

1. **Keyboard-only navigation:** No keyboard traps; all forms/buttons reachable
2. **Screen reader testing:** NVDA or VoiceOver, verify form purposes, alt text quality
3. **Focus visibility:** Outline visible at all breakpoints
4. **Color contrast:** Verify WCAG AA on all text/background combos

---

## Verdict

**Accessibility maturity:** Moderate. Modals, dropdowns, disclosure controls are solid (using Radix UI and well-known patterns). Core gaps are foundational: missing form labels and image alt text. These are straightforward to fix and critical to ship-readiness.
