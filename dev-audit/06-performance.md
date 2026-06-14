# Performance Audit Report
Date: 2026-06-13
Scope: src/components/ and src/lib/

## Summary
Bundle Size & Deps: 0 P0, 1 P1, 2 P2
Rendering: 0 P0, 2 P1, 4 P2
Images: 0 P0, 0 P1, 3 P2
Third-Party: 0 P0, 1 P1, 1 P2
Lazy Loading: 0 P0, 0 P1, 1 P2
Network: 0 P0, 1 P1, 2 P2
TOTAL: 0 P0, 5 P1, 13 P2

## Critical Issues (P1)

1. src/components/map/report-map.tsx:12-27 (Bundle)
   - Deck.gl layers always imported; no lazy load for 3D views
   - Fix: Dynamic import for HexagonLayer/HeatmapLayer when viewMode changes

2. src/components/map/report-map.tsx:281-423 (Rendering)
   - layers useMemo includes reports+viewMode+is3D; GPU buffer re-upload per filter
   - Fix: Separate marker layer from aggregation; memoize independently

3. src/components/analytics/analytics-bento.tsx:115-280+ (Rendering)
   - Child tiles (KpiCards, StatusFunnel, etc) re-render despite parent deferred value
   - Fix: Wrap each tile with memo() to skip re-render when props unchanged

4. src/components/map/report-map.tsx:1-3,12-27 (Third-Party)
   - Maplibre+Deck.gl boot (~400ms) on every map nav; no viewport detection
   - Fix: Defer init until map visible or user clicks tab

5. src/components/analytics/report-detail.tsx:217-263 (Network)
   - AI reasoning fetch chains: fires AFTER report rendered, not parallel
   - Fix: Preload /api/ai/reasoning as parent mounts

## Medium Issues (P2)

Image Optimization:
- src/components/analytics/report-detail.tsx:285-294: Raw img no width/height → layout shift
- src/components/resident/report-timeline.tsx: No icon optimization
- src/components/map/report-map-lazy.tsx: Skeleton animation not prerendered

Rendering:
- src/components/resident/community-pulse-interactive.tsx: 829 lines, no component extraction
- src/components/staff/staff-inbox.tsx: Polling+filtering+detail all in one component
- src/components/landing/orbital-steps.tsx: setInterval(50) → use rAF
- src/components/staff/work-order-row.tsx: useTimeAgo() × 50 rows = 50 intervals

Network:
- src/lib/dashboard-queries.ts:61: fetchCityStats not cached (duplicate calls)
- src/components/staff/staff-inbox.tsx: Polling every 3s, no idle check

Lazy Loading:
- src/app/city/[slug]/page.tsx: TeamsInteractive not dynamic imported

## Recommendations

High Impact:
1. Deck.gl layer memoization (50-100ms per filter)
2. Wrap bento tiles with memo() (instant FilterBar response)
3. Maplibre lazy init (save 400ms on non-map pages)

Medium Impact:
4. Cache fetchCityStats() (dedupe metadata+body)
5. Replace setInterval(50) with rAF (smooth 60fps)
6. Reasoning preload (hide latency)

Quick Wins:
7. Add width/height to img tags (prevent CLS)
8. Reduce polling 3s→5s with backoff
9. Verify WaveHero mobile branch
