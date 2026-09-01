# Code Review: Boil-the-Ocean Bug Hunt

_5 reviewer lenses (correctness, security, silent-failures, types-runtime, react-perf) x 13 LOC-balanced chunks = 65 finder agents over all 148 src files. Findings deduped across lenses. Ground truth: `tsc --noEmit` passes clean; biome rule-hits excluded as already-covered._

**Totals:** 68 unique findings across 41 files, 2 critical, 24 high, 30 medium, 12 low.

## Critical (2)

### `src/components/analytics/hover-tip.tsx` :232-295
**Portal component function recreated every setState call → unmounts and remounts tooltip DOM on every mouse-move**

Portal is defined with useCallback(..., [state, mounted]). state is the full HoverTipState object; every setState call (including every RAF-throttled move()) produces a new state reference, which makes useCallback return a new function reference. The consuming site calls it as <reasoning.Portal /> (analytics-interactive.tsx line 100). React uses the component function reference as the element type: when the reference changes between renders, React unmounts the previous tree and mounts a fresh one. Result: on every pointermove the tooltip is fully destroyed and re-created in document.body. Concretely: (a) the tooltip flickers or disappears continuously while the cursor moves; (b) tipRef.current points to a freshly-mounted element with no layout, so positionFor() always reads offsetWidth=0 and falls back to TIP_MIN_WIDTH, breaking position clamping; (c) repeated DOM insertions/removals on every RAF frame. Fix: extract Portal to a stable, non-memoized component that receives state as a prop, or change the Portal function to not be re-created by ensuring it isn't used as a JSX element type, e.g., render it as <TipPortal state={state} tipRef={tipRef} mounted={mounted} /> where TipPortal is a module-level component. Alternatively keep the useCallback but use it as {Portal()} (call syntax, not JSX element syntax) so React never sees a changing component type.

_Fix:_ Define TipPortal as a module-level React component accepting (state, tipRef, mounted) as props; change Portal from a useCallback to a simple object/render call, or call it as {tip.Portal()} (call expression) instead of <tip.Portal /> so React does not treat the changing function reference as a new component type.

### `src/components/landing/civic-globe.tsx` :44-52
**`onRender` recreated on every drag frame destroys and recreates the globe 10-60x/sec**

`onRender` is declared with `useCallback` and `delta` in its dependency array (line 51). `delta` is a `useState` value that is updated on every `onMouseMove`/`onTouchMove` event (lines 102, 109), i.e. many times per second during a drag. Because `onRender` is in the `useEffect` dependency array at line 79, every change to `delta` during a drag causes: (1) the old globe to be `.destroy()`ed, (2) a new `createGlobe(...)` call, (3) a new `resize` listener registered. This is a full canvas teardown-and-rebuild 10-60 times per second on mouse drag, completely freezing the globe and burning CPU/GPU.

_Fix:_ Replace the `useState` for delta with a `useRef`, read it in `onRender` directly, and remove `delta` from `useCallback` deps so `onRender` is stable (empty dep array). The effect then runs only once:
```ts
const deltaRef = useRef(0);
const onRender = useCallback((state: Record<string, number>) => {
  if (pointerDownX.current === null) phiRef.current += 0.0028;
  state.phi = phiRef.current + deltaRef.current;
  state.width = widthRef.current * 2;
  state.height = widthRef.current * 2;
}, []); // stable
// In onMouseMove: deltaRef.current = d / 200; (no setState)
// In onTouchMove: deltaRef.current = d / 100;
```

## High (24)

### `src/app/api/ai/classify/route.ts` :17-21
**timingSafeEqual throws when secret contains multi-byte (non-ASCII) characters**

The guard `internalKey.length === expectedKey.length` compares JS string code-unit lengths, then immediately passes `Buffer.from(internalKey)` and `Buffer.from(expectedKey)` (UTF-8 encoded) to `timingSafeEqual`. If the secret contains any non-ASCII character (e.g. a random base64url secret with '+' or '/' is fine, but one with accented chars or emoji) the JS `.length` values can be equal while the UTF-8 byte lengths differ. `timingSafeEqual` requires identical byte lengths and throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`, an uncaught exception that crashes the request. The same bug is duplicated in `src/app/api/ai/reasoning/route.ts` lines 33-37.

_Fix:_ Guard on buffer byte-lengths instead of string code-unit lengths:
```ts
const internalBuf = Buffer.from(internalKey ?? '');
const expectedBuf = Buffer.from(expectedKey ?? '');
const isInternal = Boolean(
  expectedKey && internalKey &&
  internalBuf.length === expectedBuf.length &&
  timingSafeEqual(internalBuf, expectedBuf)
);
```
Apply identically in both route files.

### `src/app/api/open311/v2/requests/route.ts` :277-279
**safeCompare leaks API key length via timing oracle**

The function returns false immediately when lengths differ (line 278: `if (a.length !== b.length) return false`), then falls through to timingSafeEqual only for same-length inputs. This creates a measurable timing difference: a wrong-length guess returns in nanoseconds while a same-length guess takes the full timingSafeEqual path. An attacker can binary-search the expected key length by submitting keys of increasing length and timing the delta. The comment explicitly says the goal is preventing timing attacks, but the length early-exit defeats that goal.

_Fix:_ Pad or hash both sides to a fixed length before comparing, or always run timingSafeEqual regardless of length mismatch. Simplest fix: `const aBuf = Buffer.from(a); const bBuf = Buffer.from(expectedKey); const cmp = Buffer.alloc(Math.max(aBuf.length, bBuf.length)); aBuf.copy(cmp); return timingSafeEqual(cmp.subarray(0, bBuf.length), bBuf) && aBuf.length === bBuf.length;`, or use a constant-length HMAC comparison instead.

### `src/app/api/open311/v2/requests/route.ts` :41-43
**service_code filter silently returns all reports, PostgREST LEFT JOIN dot-notation filters embedded rows, not parent rows**

The query uses `.select('*, classifications(*), cities!inner(*)')` where `classifications` is a LEFT JOIN (no `!inner`). Then `.eq('classifications.category', serviceCode)` is applied. In PostgREST/Supabase, dot-notation filters on a left-joined embedded resource filter which classification rows are returned for each report, NOT which reports are included in the result set. Reports with no classifications, or classifications with a different category, still appear in the response, with an empty or mismatched `classifications` array. The `service_code` query parameter is therefore silently ignored: `GET /requests?service_code=pothole` returns every non-rejected/merged report regardless of category.

_Fix:_ Use a subquery or RPC to filter on the joined table, or change to `classifications!inner(*)` so the join type enforces the filter: `.select('*, classifications!inner(*), cities!inner(*)')`. Alternatively, add an explicit `.not('classifications', 'is', null)` plus filter via `.eq('classifications.category', serviceCode)` only after switching to inner join.

### `src/app/report/actions.ts` :178-211
**Fire-and-forget classify pipeline freezes on serverless. Classify_status stuck 'pending' forever**

When ASYNC_CLASSIFY is true, `void runClassifyPipeline(reportId).catch(...)` is kicked off after the server action returns its response. On Vercel (and any serverless/edge runtime), the Node.js execution context is frozen or reclaimed the moment the HTTP response is flushed. The non-awaited microtask queue is never drained, so `runClassifyPipeline` never runs and the `.catch()` backstop never fires. The report's `classify_status` stays `'pending'` indefinitely, permanently dead-ending the resident's real-time subscription. The comment says 'completes reliably on a persistent/dev server', true for local dev, false for the deployed target. Confidence: 88.

_Fix:_ Either (a) await the pipeline before returning and accept the latency, (b) use a proper background-job mechanism (Vercel's `waitUntil` from `@vercel/functions`, or a Supabase Edge Function triggered by DB insert), or (c) poll/retry from the client rather than relying on a fire-and-forget promise. Minimal fix for Vercel: import `waitUntil` from `@vercel/functions` and wrap the pipeline: `import { waitUntil } from '@vercel/functions'; waitUntil(runClassifyPipeline(reportId).catch(...));`. This signals the platform to keep the invocation alive until the promise settles.

### `src/components/analytics/analytics-bento.tsx` :558-565
**Hardcoded SVG gradient IDs collide when multiple chart instances render**

The `renderTrendChart` function defines `<linearGradient id="g-created">` and `<linearGradient id="g-closed">` (lines 558-565) as static string IDs inside `<defs>`. The `renderSpark` function (line 3202) similarly defines `<linearGradient id="g-velocity">`. These are plain render functions (not components with isolated SVG shadow roots), so whenever more than one chart is mounted simultaneously (e.g. the in-tile `TrendChart` and the expanded `TrendChart` inside `ExpandModal` when the modal is open, or multiple analytics dashboards on a page) both SVG elements share the same `id` in the global DOM. The browser resolves `fill="url(#g-created)"` by returning the FIRST matching element. The second chart's gradient area fill therefore reads the wrong gradient (wrong colors/opacity), or if the modal chart mounts before the tile chart renders (e.g. under Concurrent Mode interleaving), both can silently swap paint. This is a real visual corruption bug that triggers every time a modal is opened.

_Fix:_ Generate a per-instance unique suffix for gradient IDs using `useId()` (React 18) inside `TrendChart` and `ReporterVelocityCardInner`, thread the ID prefix down into the render functions, and replace `"g-created"` / `"g-closed"` / `"g-velocity"` with the prefixed values. Example: `const uid = useId(); const gCreated = \`g-created-${uid}\`;` then use `id={gCreated}` and `fill={\`url(#${gCreated})\`}`.

### `src/components/analytics/analytics-bento.tsx` :882-916
**`bindDay` in `ReportsTrendInner` is recreated inline each render but captures stale `hoveredDay` in the `onClick` handler**

`bindDay` (lines 882-916) is defined as a plain function inside the render body of `ReportsTrendInner` (which is inside an early-return guard at line 809, making it a conditional definition, Biome already flagged `useHookAtTopLevel` separately, but this is a separate logic bug). The `onClick` handler at line 900 reads `hoveredDay` from the closure: `if (hoveredDay === i)`. Because `bindDay` is re-created on every render and passed to `renderTrendChart` which passes it to `<rect>` elements, the onClick always has the latest `hoveredDay`, so this particular access is fine. However, `bindDay` is **not memoized at all**, which means every render tears down and re-creates all 90+ `<rect>` event handler objects. Because `renderTrendChart` is a plain function (not a component), React cannot diff or skip the `<rect>` children, it re-creates all of them on every state change (e.g. every hover movement sets `hoveredDay` → new render → new `<rect>` elements → DOM mutation for every rect in the SVG). With 90 data points this creates 90 DOM element re-creations per pointer-move event, on every frame of hover.

_Fix:_ Memoize `bindDay` with `useCallback` so its reference is stable, and extract `renderTrendChart` into a proper React component so reconciliation can skip unchanged `<rect>` nodes. At minimum, wrap `bindDay` in `useCallback([hoveredDay, tip, data])` and stabilize `tipForDay` with `useCallback` or `useMemo` keyed on `data`.

### `src/components/analytics/analytics-bento.tsx` :1044-1047
**`slice[0]` and `slice[slice.length - 1]` accessed without empty-guard inside `ExpandModal`**

At lines 1044-1047, the `info` panel of `ExpandModal` renders:
```
<Stat hint={`${slice[0].date.slice(5)} → ${slice[slice.length - 1].date.slice(5)}`} />
```
`slice` is `data.slice(-days)`. When `days` is `7` but `data.length` is `0` (which is guarded earlier at line 809, but only for the Tile render path, not when data transitions to empty while the modal is already open), or when `days` is changed via `PillGroup` to a value that results in an empty slice (impossible with current options but only because of incidental data constraints, not a code guard), `slice[0]` is `undefined` and `.date` throws. More concretely: the guard at line 809 returns early and renders a `<Tile>` with `<EmptyState>`, but `ExpandModal` is always rendered in the JSX tree (lines 983-1067) regardless of the `data.length === 0` guard. If `data` changes to empty while the modal is open (parent re-render mid-session), the ExpandModal remains open (`open` state is `true`), `slice` becomes `[]`, and line 1046 crashes with `Cannot read properties of undefined (reading 'date')`.

_Fix:_ Add a guard: `hint={slice.length > 0 ? \`${slice[0].date.slice(5)} → ${slice[slice.length - 1].date.slice(5)}\` : '-'}`. Also guard `peakDay.date.slice(5)` at line 1055 (already partially guarded by the `peakDay` fallback object but `slice.length` check for Stat is missing).

### `src/components/analytics/hover-tip.tsx` :182-223
**bindTarget closes over state.visible directly instead of using setState functional update, and its identity changes on every visibility toggle**

bindTarget is wrapped in useCallback with deps [show, move, hide, state.visible]. (1) Stale-closure risk: the onClick handler at line 208 reads state.visible from the captured closure. On touch, a tap fires onClick; if a re-render is in flight that has not yet propagated the updated state.visible, the handler reads the old value and either shows when it should hide or vice-versa. Because touch click events fire asynchronously relative to React's batch flush, this race is real on low-end devices. (2) Perf: whenever state.visible flips (show→hide or hide→show), bindTarget gets a new reference. Every component that receives bindTarget as a prop (or whose render calls bindTarget and spreads the result) re-renders unnecessarily. Fix: read state.visible inside onClick via a setState functional updater instead of from the closed-over variable: setState(prev => { if (!prev.visible) { show(...); } else { hide(); } return prev; }), or use a separate ref: const visibleRef = useRef(false); keep it in sync via a useEffect, and read visibleRef.current inside onClick. This also lets bindTarget's dep array drop state.visible so it stays stable.

_Fix:_ Track visibility in a ref (const visibleRef = useRef(false)) kept in sync by a useEffect on state.visible. Read visibleRef.current in onClick instead of state.visible. Remove state.visible from bindTarget's useCallback dep array so its identity is stable.

### `src/components/analytics/reasoning-hover.tsx` :157-169
**fetch inside ensureData has no AbortController, stale closure + post-unmount setState**

When a user triggers a hover that starts a fetch, then quickly moves away (closing the hover) or the parent component unmounts before the response arrives, the `.then` callbacks still execute. The `activeId.current === id` guard prevents displaying data for the wrong report, but: (1) `cache.current.set(id, json)` still runs unconditionally, and (2) `setData(json)` fires if `activeId.current` happens to match a newly re-opened hover for the same id. Meaning stale data from a previous context can silently overwrite a fresh request. More critically, if the component unmounts while a fetch is in-flight, calling `setData` on an unmounted component causes a React warning (and wasted work in concurrent mode). There is no AbortController to cancel the in-flight request.

_Fix:_ Create a per-call AbortController and abort it on cleanup. Inside `ensureData`, capture the id in a local variable and use an AbortSignal:
```ts
const ensureData = useCallback((id: string, demo?: boolean, ai_reasoning?: string) => {
  // ... demo branch unchanged ...
  const cached = cache.current.get(id);
  if (cached) { setData(cached); return; }
  setData(null);
  const controller = new AbortController();
  // store ref so we can abort on close / unmount
  fetchControllerRef.current?.abort();
  fetchControllerRef.current = controller;
  fetch('/api/ai/reasoning', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_id: id }),
    signal: controller.signal,
  })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then((json: ReasoningResponse) => {
      cache.current.set(id, json);
      if (activeId.current === id) setData(json);
    })
    .catch((e) => { if (e?.name !== 'AbortError') { /* leave in loading */ } });
}, []);
```
Add `const fetchControllerRef = useRef<AbortController | null>(null);` and abort in the `useEffect` cleanup alongside the intent timer.

### `src/components/analytics/reasoning-hover.tsx` :258-311
**Portal returned as useCallback breaks component identity, portal div remounts on every state change**

`Portal` is defined as `useCallback(() => { ... return createPortal(...) }, [mounted, target, data, pos])`. At the call site, consumers render it as `<Portal />`. Because `Portal` is a new function reference on every dependency change, React sees a new component type on every render and fully unmounts then remounts the portal div. This tears down and rebuilds the DOM node on every position update and every data state change, causing the 150ms `transition-[opacity,transform]` CSS animation to restart from zero rather than interpolating. The card visually flickers instead of fading in smoothly.

_Fix:_ Convert `Portal` from a `useCallback`-wrapped inline component to a stable component defined outside the hook, or return JSX directly from the hook (renamed to something like `portalNode`). The simplest fix: rename to `portalNode` and have callers render it directly (not as a JSX tag):
```ts
// Inside the hook, replace the useCallback:
const portalNode = !mounted || typeof document === 'undefined' ? null : createPortal(
  <ReasoningCard ref={cardRef} ... />,
  document.body,
);
return { bindReport, portalNode };
// Caller: {portalNode} not <Portal />
```
Alternatively, keep the component form but define it as a stable component outside the hook, passing state as props.

### `src/components/landing/orbital-steps.tsx` :283-329
**Auto-rotate `setInterval` can leak if `autoRotate` flips rapidly**

The auto-rotate effect (lines 283-329) is correct in the happy path. However `toggleItem` (line 253) calls `setAutoRotate(false)` and then `setAutoRotate(true)` conditionally inside a `setExpandedItems` updater. Because `setExpandedItems` receives a functional updater, React may batch these state updates. The critical race: if `autoRotate` is `true` and the user quickly clicks a node and then clicks the background (or another node), `autoRotate` flips `false → true` in rapid succession. Each flip re-runs the effect, which calls `startInterval()`. Between flips the old cleanup runs `stopInterval()` (clears old `intervalId`). This is correctly handled. BUT: inside `toggleItem` at lines 261-273, `setActiveNodeId`, `setPulseEffect`, and `setAutoRotate` are called synchronously inside the `setExpandedItems` functional updater at line 254. React does NOT allow side-effects (i.e. calling other `setState` setters) inside a `setState` updater in a way that is guaranteed to be batched (in React 18 with automatic batching this will schedule separate re-renders, but the calls to `setActiveNodeId(id)` etc. at line 261 execute INSIDE the updater callback (a function passed to `setExpandedItems`). This is a misuse of the setState functional form) side effects should not be triggered inside the updater function. In Strict Mode this updater runs twice, calling `setActiveNodeId`, `setAutoRotate`, and `setPulseEffect` twice, which may cause the interval to start, stop, and restart with a doubled tick rate until the double-invocation settles.

_Fix:_ Move the `setActiveNodeId`, `setAutoRotate`, and `setPulseEffect` calls out of the `setExpandedItems` functional updater:
```ts
const toggleItem = (id: number) => {
  const wasExpanded = expandedItems[id];
  setExpandedItems(() => { const next: Record<number,boolean> = {}; next[id] = !wasExpanded; return next; });
  if (!wasExpanded) {
    setActiveNodeId(id);
    setAutoRotate(false);
    const item = CIVIC_STEPS.find((i) => i.id === id);
    const pulses: Record<number,boolean> = {};
    item?.relatedIds.forEach((relId) => { pulses[relId] = true; });
    setPulseEffect(pulses);
    const nodeIndex = CIVIC_STEPS.findIndex((i) => i.id === id);
    setRotationAngle(270 - (nodeIndex / CIVIC_STEPS.length) * 360);
  } else {
    setActiveNodeId(null);
    setAutoRotate(true);
    setPulseEffect({});
  }
};
```

### `src/components/landing/orbital-steps.tsx` :253-280
**Multiple `setState` calls inside `setExpandedItems` functional updater, causes doubled interval under Strict Mode and misuse of updater contract**

Inside `toggleItem`, `setExpandedItems` receives a functional updater (line 254). Inside that updater callback, four other state-setter calls fire: `setActiveNodeId`, `setAutoRotate`, `setPulseEffect`, and `setRotationAngle` (lines 261-273 and 274-278). React's contract for functional updaters is that they must be pure, no side effects. In React 18 Strict Mode, functional updaters are invoked twice in development, so all four secondary `setState` calls fire twice. `setAutoRotate(false)` fires twice → the auto-rotate effect re-runs twice → `startInterval` may create two intervals before the cleanup of the first fires. This does not manifest in production (Strict Mode off) but creates a doubled-tick bug in dev that masks real timing defects.

_Fix:_ Move all secondary state calls out of the updater and into the top-level of `toggleItem`:
```ts
const toggleItem = (id: number) => {
  const wasExpanded = !!expandedItems[id];
  setExpandedItems(() => { const next: Record<number,boolean> = {}; next[id] = !wasExpanded; return next; });
  if (!wasExpanded) {
    setActiveNodeId(id);
    setAutoRotate(false);
    const item = CIVIC_STEPS.find((i) => i.id === id);
    const pulses: Record<number,boolean> = {};
    item?.relatedIds.forEach((relId) => { pulses[relId] = true; });
    setPulseEffect(pulses);
    const nodeIndex = CIVIC_STEPS.findIndex((i) => i.id === id);
    setRotationAngle(270 - (nodeIndex / CIVIC_STEPS.length) * 360);
  } else {
    setActiveNodeId(null);
    setAutoRotate(true);
    setPulseEffect({});
  }
};
```

### `src/components/map/fullscreen-map.tsx` :183-185
**setTimeout fires setState on unmounted component, no cleanup**

handleRouteToTeam (line 160) calls setTimeout(() => { setRouteNotification(null); }, 3500) but never stores the timer ID. If the user navigates away (component unmounts) before the 3.5 s window elapses, the callback fires and calls setRouteNotification on a dead component. React 18 silently swallows the call but the handler still runs, and any future version that re-enables the 'setState on unmounted' warning will surface this immediately. There is no useEffect cleanup path to cancel the timer.

_Fix:_ Store the timer ID in a useRef and cancel it on unmount. Refactor the call site into a useEffect: const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);, in handleRouteToTeam replace the raw setTimeout with: if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => setRouteNotification(null), 3500);, add useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []) to cancel on unmount.

### `src/components/map/fullscreen-map.tsx` :75
**useState(initialReports) ignores all subsequent prop updates. Live corpus data silently dropped**

const [reports, setReports] = useState<DashboardReport[]>(initialReports) initializes local state from the prop exactly once. CorpusMapView passes a memoized filtered slice of the shared corpus (useReportCorpus). When that corpus refreshes (e.g., a Supabase real-time subscription delivers a new row, or a task is marked done), CorpusMapView re-renders with a new reports array (but useState ignores prop changes after mount. The stale reports value then feeds allReports (line 89-92), filteredReports (line 133-143), and the dispatch panel list. The only mutation path is handleRouteToTeam which calls setReports for a local status change) real server updates are silently discarded.

_Fix:_ Either (a) drop local reports state entirely and derive from the prop directly (use initialReports as the base and apply local status overrides via a separate Map<id, Partial<DashboardReport>> overlay merged at render time), or (b) add a synchronising effect: useEffect(() => { setReports(initialReports); }, [initialReports]). Option (a) is cleaner and avoids the two-source-of-truth problem; option (b) works but causes an extra render on every corpus refresh.

### `src/components/report/camera-capture.tsx` :83-93
**Old MediaStream not stopped before startCamera acquires a new one**

startCamera() unconditionally overwrites streamRef.current (line 93) with the new stream without stopping the previous stream's tracks first. The effect cleanup (lines 124-127) only fires on unmount or when decided/useNative change, not on ad-hoc calls. When the user clicks 'Try Again' (line 272), startCamera runs directly: the prior stream (still active) is orphaned, camera indicator stays on in the OS/browser tab, and the track is never released. Reproducible: grant camera access on desktop → wait for any mid-init error → click 'Try Again' → old stream leaks.

_Fix:_ At the very top of startCamera, before getUserMedia, stop and clear the prior stream: `streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;`

### `src/components/resident/notifications-feed.tsx` :48-50
**readIds initializer never re-syncs when items prop changes**

The lazy useState initializer `() => new Set(items.filter(i => i.read).map(i => i.id))` runs exactly once at mount. If the parent re-fetches and passes a new items array with updated read flags (e.g. server marks an item read via a background refresh), readIds is never updated: items that arrive as read: true in the new prop appear as unread (dot shown, blue background). The component has no useEffect that syncs readIds to items changes.

_Fix:_ Add a useEffect that resyncs on items identity change: `useEffect(() => { setReadIds(prev => { const next = new Set(prev); items.filter(i => i.read).forEach(i => next.add(i.id)); return next; }); }, [items]);`. Merging rather than replacing preserves any reads the user made locally in the current session.

### `src/components/resident/updates-popover.tsx` :65-85
**loading in useEffect deps cancels in-flight fetch on every state update**

The fetch effect declares deps [open, items, loading]. When the fetch starts it calls setLoading(true), which schedules a re-render. React re-runs the effect: the cleanup fires first, setting cancelled = true on the original invocation, then the new invocation hits the `if (!open || items !== null || loading) return` guard and exits. The original promise is still in-flight but cancelled is now true, so .then()/.catch() silently discard the result: setItems is never called, setLoading(false) is never called, and the component hangs in a loading spinner permanently. This race is reproducible: open the popover on a slow connection so the fetch takes more than one render cycle.

_Fix:_ Remove `loading` from the dependency array (it is not needed; the guard `items !== null` is sufficient to prevent re-entry). Suppress the lint rule with an inline comment if needed: `// eslint-disable-next-line react-hooks/exhaustive-deps`

### `src/components/staff/work-order-comments.tsx` :27-37
**Supabase initial fetch has no abort, stale workOrderId data overwrites state**

The `useEffect` fires on `workOrderId` change (dep array line 63). On each run it creates a new supabase client, starts a `.select().then(...)` fetch (lines 30-37), and a new channel subscription. The cleanup (lines 60-62) correctly removes the channel, but the in-flight `.then()` callback is NOT cancelled. If the user opens work order A then quickly opens work order B (or closes the panel) before A's fetch resolves, A's `.then` fires and calls `setComments(data)` with A's comment data inside B's mounted instance (or post-unmount). Result: wrong comments displayed for the wrong work order, silently, with no error.

_Fix:_ Add a mounted/cancelled flag:
```ts
useEffect(() => {
  let cancelled = false;
  const supabase = createBrowserSupabase();
  supabase
    .from('work_order_comments')
    .select('id, body, author_id, created_at')
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: true })
    .then(({ data }) => {
      if (!cancelled && data) setComments(data as Comment[]);
    });
  const channel = supabase
    .channel(`wo_comments_${workOrderId}`)
    // ... same subscription setup ...
    .subscribe();
  return () => {
    cancelled = true;
    supabase.removeChannel(channel);
  };
}, [workOrderId]);
```

### `src/components/teams/team-task-detail.tsx` :84-96
**Body scroll lock permanently applied when parent re-renders while sheet is open**

The useEffect at line 84 has `[open, onClose]` as deps. `onClose` is passed as `() => setSelectedId(null)` (an inline arrow) from `team-tasks-interactive.tsx` line 172, so it gets a new identity on every parent render. Any state change in the parent (tab switch, corpus update, selectedId change) while the sheet is open triggers the effect cleanup (which runs `document.body.style.overflow = prev` where `prev` was captured as `"hidden"` (the body's current state at the time this re-run started), then immediately re-runs and sets it to `"hidden"` again. When the sheet finally closes, the cleanup from this last re-registration restores `prev = "hidden"` (not `""`)) leaving `document.body.style.overflow = "hidden"` permanently after the sheet dismisses. Scrolling is broken until a hard reload.

_Fix:_ Stabilize the `onClose` reference with `useCallback` in the parent (`const onClose = useCallback(() => setSelectedId(null), [])`) so the scroll-lock effect is only registered once per open/close transition. Alternatively, remove `onClose` from the dep array and capture it in a ref: `const onCloseRef = useRef(onClose); useEffect(() => { onCloseRef.current = onClose; }); useEffect(() => { if (!open) return; const handler = (e) => { if (e.key === 'Escape') onCloseRef.current(); }; ... }, [open]);`

### `src/components/ui/cobe-globe.tsx` :338-345
**ResizeObserver used for lazy init never disconnected on unmount**

When `canvas.offsetWidth === 0` on mount (e.g. the globe is initially hidden or the layout hasn't settled), a `ResizeObserver` (`ro`) is created and observes the canvas (lines 338-345). It disconnects itself only when `entries[0]?.contentRect.width > 0` and `init()` runs. The cleanup function returned at line 347 has no reference to `ro` and does not disconnect it. If the component unmounts before the canvas ever gets a non-zero width (e.g. the user navigates away immediately, or the element is conditionally hidden) `ro` stays alive, holding a reference to the detached canvas DOM node and the closure, causing a memory leak.

_Fix:_ Capture the lazy `ro` in a variable accessible from the cleanup scope and disconnect it unconditionally in the return function:
```ts
let lazyRo: ResizeObserver | null = null;
if (canvas.offsetWidth > 0) {
  init();
} else {
  lazyRo = new ResizeObserver((entries) => {
    if (entries[0]?.contentRect.width > 0) {
      lazyRo!.disconnect();
      lazyRo = null;
      init();
    }
  });
  lazyRo.observe(canvas);
}
return () => {
  lazyRo?.disconnect();
  io.disconnect();
  if (animationId) cancelAnimationFrame(animationId);
  if (globe) globe.destroy();
};
```

### `src/lib/dashboard-data.ts` :407-447
**REPORT_CORPUS age_days frozen at module-load; fetchCityStats week-buckets drift from getCityMorale over time**

buildCorpus() runs once at module-evaluation time (line 407) and bakes each CorpusReport's age_days from Date.now() at that moment. fetchCityStats (lines 431-435) later reads r.age_days to compute this_week (age_days <= 7) and prev_week (age_days > 7 && <= 14). Because REPORT_CORPUS is a module-level singleton, those age_days values never update. Meanwhile getCityMorale in resident-data.ts (line 299-304) re-derives ageDays from r.created_at using a fresh Date.now() at request time. After a server process runs for even a few hours, the same report will be counted in different week-buckets by the two paths: fetchCityStats still sees it as 'this week' (frozen age) while getCityMorale sees it as 'prior week' (live age). The KPI stat bar (this_week / prev_week) and the morale card (resolvedThisWeek, reportedThisWeek) will silently diverge. This also means the momentum signal ('up'/'flat'/'down') in CityMorale can contradict the trend shown by fetchCityStats.

_Fix:_ Remove age_days from CorpusReport and from fetchCityStats. Compute week-bucket counts in fetchCityStats by re-deriving age from created_at using Date.now(). The same approach getCityMorale already uses. Example: const now = Date.now(); const this_week = REPORT_CORPUS.filter(r => (now - new Date(r.created_at).getTime()) / 86_400_000 <= 7).length; Drop the age_days field from the CorpusReport interface and buildCorpus return value since it is only used inside fetchCityStats.

### `src/lib/filters/context.tsx` :120-130
**Side effect (router.replace) inside useState updater, double-fires in Strict Mode**

The `patch` callback wraps a `setFilterState` updater that calls `syncUrl(next)` (which calls `router.replace(...)`) from inside the updater body. React requires state updaters to be pure. In React Strict Mode (the default in Next.js `next dev`) React intentionally double-invokes state updaters to detect impurity. This causes `router.replace` to fire TWICE per every filter interaction (preset change, category toggle, severity slider, etc.) in development, pushing duplicate history entries and producing hard-to-debug double URL rewrites. In production the double-invoke doesn't happen, but the pattern violates React's contract for state updaters and is a latent bug for any future concurrent-mode feature (e.g. `useTransition`, `startTransition`) that may re-invoke the updater during scheduling.

_Fix:_ Move the `syncUrl` call out of the updater and into the `patch` callback body, computing `next` directly from the current filter reference:
```tsx
const patch = useCallback(
  (partial: Partial<ReportFilter>) => {
    setFilterState((prev) => {
      const next = { ...prev, ...partial };
      if (lockedTeam) next.team = lockedTeam;
      return next;
    });
    // syncUrl reads the filter AFTER state commit. Use functional form
    // or compute next independently for the URL:
    setFilterState((prev) => {
      const next = { ...prev, ...partial };
      if (lockedTeam) next.team = lockedTeam;
      syncUrl(next); // still in updater. See alternative below
      return next;
    });
  },
  [syncUrl, lockedTeam],
);
```
Better: compute `next` once outside the updater, set state with the value (not a function), and call `syncUrl` separately:
```tsx
const patch = useCallback(
  (partial: Partial<ReportFilter>) => {
    // Read current filter via a ref to avoid stale closure
    setFilterState((prev) => {
      const next = { ...prev, ...partial };
      if (lockedTeam) next.team = lockedTeam;
      return next;
    });
    // Synchronise URL outside the updater using a ref for latest state
    // or accept 1-render lag; the cleanest approach is a useEffect on filter:
  },
  [syncUrl, lockedTeam],
);
```
The cleanest production-safe fix is to track filter in a `useRef` (or accept a one-render-behind URL) and drive `syncUrl` from a `useEffect(() => { syncUrl(filter); }, [filter, syncUrl])` outside `patch` entirely. `setFilter` already does this correctly (calls `syncUrl` outside the updater on line 115). `patch` should follow the same pattern using a functional update plus an external `syncUrl` call.

### `src/lib/privacy/audit.ts` :44-67
**N+1 serial storage RPCs in audit loop, up to 1000 round-trips per call**

The outer loop at line 44 iterates over `publicFiles` (up to 1000 items from `.list(cityId, { limit: 1000 })`). For each file, line 48-51 fires a separate `supabase.storage.from(RAW_BUCKET).list(cityId, { limit: 1, search: file.name })` call. These are awaited serially inside the for-loop via implicit `await` from async context. With 1000 files, this is 1001 serial network round-trips. At a typical 10-50ms per Supabase storage RPC, audit for a city with 500+ reports takes 5-25 seconds, blocking the handler for its entire duration, and saturates the Supabase connection pool for the duration. For cities with many reports this will consistently time out.

_Fix:_ List the raw bucket once (outside the loop) and build a Map of `name -> metadata`, then compare in-memory: `const { data: rawFiles } = await supabase.storage.from(RAW_BUCKET).list(cityId, { limit: 1000 }); const rawMap = new Map(rawFiles?.map(f => [f.name, f.metadata]) ?? []); for (const file of publicFiles) { const rawMeta = rawMap.get(file.name); if (rawMeta?.size && file.metadata?.size && rawMeta.size === file.metadata.size) violations.push(...); }`, reduces N+1 to 2 RPCs.

### `src/lib/privacy/upload.ts` :30-38
**MIME validation trusts self-reported blob.type, trivially bypassable, sniff-mime.ts unused**

`validateMime` checks `blob.type` which is the MIME type reported by the browser from the File object. For a File created via `<input type=file>`, the browser infers this from the file extension, not the actual byte content. An attacker (or a malformed file) can set any MIME type by renaming the file: `malware.exe` renamed to `exploit.webp` results in `blob.type === 'image/webp'`, passing the allow-list check. The raw bucket then stores arbitrary binary content, and if the signed-URL route later serves it, downstream consumers receive non-image content claiming to be WebP. The codebase already contains `src/lib/image/sniff-mime.ts` that performs magic-byte validation but it is never called in the upload path.

_Fix:_ Before the `validateMime` call, read the first 12 bytes of the blob and pass them to `sniffImageMime`. Reject if the sniffed type is null or does not match the allowed set: `const header = await blob.slice(0, 12).arrayBuffer(); const sniffed = sniffImageMime(new Uint8Array(header)); if (!sniffed || !ALLOWED_MIME_TYPES.has(sniffed)) return { ok: false, error: 'Rejected: file header does not match an allowed image type' };`

## Medium (30)

### `src/app/api/open311/v2/requests/route.ts` :232-236
**Fire-and-forget fetch has no .catch(), unhandled promise rejection risk in serverless**

Line 232: `fetch(...) ` is called without `await` and without `.catch()`. In Next.js App Router serverless functions (Vercel/AWS Lambda), the function runtime may freeze or terminate before the in-flight fetch completes, silently dropping the AI classification request. Additionally, Node 18+ treats unhandled promise rejections as fatal by default (or at minimum logs noisy warnings). If the classify endpoint is unreachable or returns a network error, the rejected promise goes unhandled. No logging, no retry, no dead-letter. The report sits permanently unclassified with zero observability.

_Fix:_ Attach at minimum a `.catch` to prevent the unhandled rejection: `fetch(...).catch((err) => console.error('classify fire-and-forget failed:', err))`. For stronger reliability in serverless, use `waitUntil` from Next.js unstable API: `import { unstable_after as after } from 'next/server'; after(fetch(...).catch(...))`, this extends the serverless lifetime to allow the fetch to complete.

### `src/app/report/page.tsx` :79-86
**signInAnonymously() rejection silently swallowed, user hits auth error only at submit**

The anonymous session effect calls `supabase.auth.signInAnonymously()` fire-and-forget with no `.catch()` and no error state update. If the call fails (network offline, Supabase quota, CORS) the component shows no indication (`step` stays at `'camera'` and the resident takes a photo. When they tap submit, `submitReport` (the server action) will reject with an unauthenticated error. The outer catch in `handleSubmit` (line 192-197) lands on the fallback `done` screen with `crypto.randomUUID()` as the fake report ID) meaning a real auth failure silently presents as a successful report submission. The submitted data was never persisted.

_Fix:_ Add a `.catch()` to `signInAnonymously()` that sets the `error` state: `supabase.auth.signInAnonymously().catch(() => setError('Could not start a session. Check your connection and refresh.'));`. This surfaces the failure before photo capture, not after a fake confirmation screen.

### `src/app/staff/actions.ts` :67-90
**TOCTOU race in dispatchWorkOrder: work_order updated then report_id fetched in a separate query**

In `dispatchWorkOrder`, the work order is updated at line 68 (setting `dispatched_at`/`assigned_crew_id`), then a second separate query at line 75 fetches the `report_id` from the same row. Between these two DB round-trips any concurrent mutation (a second dispatcher, a cleanup job, or a test truncation) can modify or delete the row, causing the second query to return null. When `wo` is null (line 81), the linked `reports` row is never updated, leaving `report.status = 'open'` even though the work order is now dispatched, a permanent data-integrity inconsistency. The same pattern is repeated in `closeWorkOrder` at lines 107-130. Confidence: 85.

_Fix:_ Combine the update and the report_id fetch into a single query using `.update(...).eq('id', workOrderId).select('report_id').single()`. This returns the updated row atomically without a second round-trip and eliminates the race window:
```ts
const { data: wo, error: woError } = await supabase
  .from('work_orders')
  .update(update)
  .eq('id', workOrderId)
  .select('report_id')
  .single();
if (woError) return { ok: false, error: woError.message };
```
Apply identically to `closeWorkOrder`.

### `src/app/staff/actions.ts` :107-130
**TOCTOU race in closeWorkOrder: same two-query pattern as dispatchWorkOrder**

Identical structural defect to the `dispatchWorkOrder` finding above. Work order is updated at line 107 (setting `completed_at`/`resolution_photo_url`), then report_id is fetched in a separate query at line 114. If the row is concurrently deleted or modified, the report status is never updated to 'closed', leaving the system in an inconsistent state. Confidence: 85.

_Fix:_ Same fix as `dispatchWorkOrder`: merge the update and select into a single chained `.update(...).select('report_id').single()` call, eliminating the separate fetch at lines 114-117.

### `src/components/analytics/analytics-bento.tsx` :797-798
**`days` state initialized from `data.length` never resets when `data` prop changes**

`const [days, setDays] = useState<number>(data.length)` at line 797 runs only on first mount. If the parent component re-renders `ReportsTrend` with a different `data` array (e.g. when the user switches city/date-range and `data` has a different length), `days` remains stale at the old length. The `slice` memo at lines 804-807 then evaluates `days >= data.length` with the old `days` value against the new `data.length`, causing incorrect slicing: if old length (e.g. 90) > new length (e.g. 30), `days >= data.length` is true and the full new array is shown (seemingly correct), but if old length (30) < new length (90), the slice is `data.slice(-30)` instead of showing all data, and the PillGroup "All" option still shows the old `data.length` (30) rather than the new one (90).

_Fix:_ Add a `useEffect` (or use a `key` prop on the parent) to reset `days` when `data.length` changes: `useEffect(() => { setDays(data.length); }, [data.length]);`. Alternatively, derive the effective range as `Math.min(days, data.length)` in the slice memo and reset `days` to `data.length` when `data.length` grows beyond the current `days`.

### `src/components/analytics/analytics-bento.tsx` :3319-3347
**`bigNumTipOpen` state is set but never read; tip visibility is driven by `tip.hide()`/`tip.show()` instead, causing the state to be dead and always-stale**

`const [bigNumTipOpen, setBigNumTipOpen] = useState(false)` is declared at line 3319. `setBigNumTipOpen(true/false)` is called in the `onClick` and `onBlur` handlers of `bindBigNumber` (lines 3336-3346). But `bigNumTipOpen` is **never read** anywhere in the component (the actual tooltip visibility is managed by `tip.show()`/`tip.hide()` calls that operate directly on the `useHoverTip` internal state. This means: (1) `bigNumTipOpen` is a zombie state that drives unnecessary re-renders on every tap-to-toggle and blur event; (2) the toggle logic `if (bigNumTipOpen)` at line 3336 reads the value from the render closure, which is one render behind) on first tap, `bigNumTipOpen` is `false`, the else branch runs `setBigNumTipOpen(true); tip.show(...)`. On second tap (without an intervening re-render commit), `bigNumTipOpen` is still `false` in the stale closure, so the else branch runs again, toggling shows the tip twice without hiding it. In React Concurrent Mode where state updates may be batched differently, this race is more likely to manifest.

_Fix:_ Remove `bigNumTipOpen` state entirely. Use a ref to track open state for the toggle logic (consistent with how every other handler in the file uses `activeKey.current` or `heatPtrType.current`): `const bigNumOpen = useRef(false);` and flip it in onClick.

### `src/components/analytics/analytics-bento.tsx` :129-323
**`cards` array and all `tip()` closures inside `KpiCardsInner` are recreated on every render**

The `cards: KpiCard[]` array (lines 129-323) is constructed fresh on every render of `KpiCardsInner`. Each card object contains a `tip` function that itself closes over `kpis`, `MTTR_TARGET_HOURS`, and `RESOLUTION_IDEAL`. Because `cards` is not wrapped in `useMemo`, every hover state change (`setHoveredKpi`) triggers a full re-creation of all four card objects including their JSX-returning tip functions. The `bindCard` function at line 325 is also re-created every render. Since `KpiCardsInner` is wrapped in `memo`, this is only a problem when `kpis` changes (but even a stable `kpis` reference doesn't help because `cards` itself is the unstable value being created inside the function body, not passed as a prop. More critically, `bindCard(c)` at line 367 is called inline in JSX, creating a new handler object on every render, so the `div`'s event handlers change every render even if `kpis` is stable) preventing React from skipping DOM updates.

_Fix:_ Wrap `cards` in `useMemo([kpis])`. Wrap `bindCard` in `useCallback([bindTip, setHoveredKpi])`. This is especially impactful because `KpiCards` is at the top of a data-dense dashboard that likely re-renders frequently.

### `src/components/analytics/reasoning-hover.tsx` :261
**reducedMotion() reads window.matchMedia on every Portal render, SSR/hydration divergence risk**

`reducedMotion()` is called inline on every invocation of the `Portal` callback (every render). On the server, `typeof window === 'undefined'` is true and it returns `false`. On the client during hydration, `window.matchMedia('(prefers-reduced-motion: reduce)').matches` may return `true` for users with that OS preference. This server/client divergence in the conditional className applied to the portal div (`!noMotion && 'transition-[opacity,transform]...'`) causes a hydration mismatch. Even ignoring SSR, calling `matchMedia` on every render is wasteful. The result is stable for the lifetime of the component.

_Fix:_ Compute this once at hook init using a state initializer or a ref:
```ts
const prefersReducedMotion = useRef(
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);
// Then inside Portal/portalNode:
const noMotion = prefersReducedMotion.current;
```
Or, if the value needs to react to OS-level changes mid-session, use a `useEffect` to subscribe to the media query's `change` event and store in state.

### `src/components/analytics/report-detail.tsx` :208-247
**useReasoning suppresses exhaustive-deps: report object excluded, so demo-path short-circuit goes stale if report fields change for the same ID**

The effect dep array is [reportId] (line 247 has eslint-disable-next-line react-hooks/exhaustive-deps). The effect body also reads report.demo and report.ai_reasoning (lines 215-216). If the same report ID is selected but the report object is updated (e.g., a Supabase real-time subscription pushes a patch that sets demo=false or updates ai_reasoning), reportId does not change, so the effect does not re-run. The component continues rendering the baked demo response even though the report is no longer flagged as demo. In a live app with real-time data this surfaces as permanently stale AI reasoning after a field update. Fix: include report (or the specific fields report.demo and report.ai_reasoning) in the dependency array; since report is an object reference that changes on every re-fetch, prefer depending on the scalar fields: [reportId, report?.demo, report?.ai_reasoning].

_Fix:_ Change the dep array from [reportId] to [reportId, report?.demo, report?.ai_reasoning] and remove the eslint-disable comment. The effect body already handles the null-report case at line 209.

### `src/components/analytics/reports-explorer.tsx` :61-67
**Selection-guard effect includes selectedId in deps, causing a redundant extra effect run and render cycle after every auto-selection**

The effect fires when open, reports, or selectedId changes. When the guard determines the current selection is invalid and calls setSelectedId(reports[0]?.id), selectedId changes, which schedules the effect to run again. The second run sees stillValid=true and exits early, no infinite loop, but two render cycles occur instead of one. For every filter change while the explorer is open this doubles the selection-reconciliation work. Fix: remove selectedId from the dependency array and derive validity using a ref or move the check into the reports/open effect only, using the functional form of setSelectedId to read the previous value: setSelectedId(prev => { const ok = reports.some(r => r.id === prev); return ok ? prev : (reports[0]?.id ?? null); }). This eliminates the selectedId dep entirely.

_Fix:_ Replace the separate effect with: useEffect(() => { if (!open) return; setSelectedId(prev => reports.some(r => r.id === prev) ? prev : (reports[0]?.id ?? null)); }, [open, reports]);. Drop selectedId from deps. The functional updater reads the previous value without capturing it.

### `src/components/landing/wave-hero.tsx` :186-189
**Early return on `reducedMotion` path leaves ResizeObserver leak on re-render**

When `reducedMotion` is true the effect executes `resize()`, calls `renderFrame(0)`, then returns `undefined` (no cleanup function, line 188). `resize()` itself is safe (no listeners). However, if the component is unmounted while `reducedMotion` is true, no cleanup fires at all, that is harmless in this specific path (no RAF, no listener, no observer). The real problem is: the `ResizeObserver` (`ro`) is only constructed in the non-reducedMotion branch (line 106), but `window.addEventListener('resize', onResize)` is also only in the non-reducedMotion branch. Both are cleaned up correctly in the returned cleanup for that branch. This path is clean, marking as low-confidence informational only; the actual confirmed gap is that `renderFrame` is called with `t=0` but `data` can be null at the point `resize()` is called if `canvas.clientWidth` and `window.innerWidth` both return 0 (e.g. SSR hydration mismatch edge case), causing a silent no-op `if (!data || !img) return` inside `renderFrame`. Not a crash, but renders a blank canvas rather than a frozen frame, making the 'intentional frozen frame' comment incorrect under zero-dimension conditions.

_Fix:_ Guard `renderFrame(0)` with a check: `if (data && img) renderFrame(0);`, or equivalently, only render after confirming `bw > 0 && bh > 0`.

### `src/components/landing/wave-hero.tsx` :205-207
**If `isMobile` is true, the effect returns early before creating any subscriptions. This is clean. But: `io` is created AFTER the `reducedMotion` early return (line 205), so it IS cleaned up by the returned cleanup. However the `window.addEventListener('resize', onResize)` at line 210 is also only in the non-reducedMotion branch. Confirmed: all paths are correctly cleaned up. This is NOT a bug.**

_Fix:_ No fix required, marking as verified clean after thorough analysis.

### `src/components/map/fullscreen-map.tsx` :201-496
**dispatchPanelContent is a JSX variable mounted in two DOM locations. Doubles reconciliation work on every state change**

dispatchPanelContent is assigned as a plain JSX variable (not a React component) and then used verbatim at both line 544 (BottomSheet) and line 571 (LiquidGlassCard desktop panel). React mounts two independent subtrees from the same JSX definition. Every state change that triggers a re-render of FullscreenMapOrchestrator (including focusedReportId, activeRouteMenuId, routeNotification, and filter changes) causes React to diff and reconcile both copies of the full filteredReports list. All onClick closures inside the map() are also recreated twice. For the hackathon corpus (~50-200 reports) this is tolerable, but the pattern ensures the cost scales linearly with report count × 2.

_Fix:_ Extract dispatchPanelContent into a memoized component: const DispatchPanel = memo(function DispatchPanel({ filteredReports, ... }) { ... }) and pass the required state values as props. React will only reconcile each mounted instance independently, and memo will skip re-renders when props are unchanged. The two usage sites become <DispatchPanel ... /> which React correctly identifies as the same component type across both mount points.

### `src/components/map/report-map.tsx` :348-354
**onSelectMarker captured in layers useMemo dep causes full layer rebuild when caller forgets useCallback**

The layers useMemo at line 221 includes onSelectMarker in its dependency array (line 385). The onClick handler inside the dots ScatterplotLayer at line 348 closes over onSelectMarker. ReportMap is wrapped in memo(), which shallow-compares props, if a caller passes onSelectMarker as an inline arrow function (common in non-fullscreen usage via ReportMapLazy), memo's comparison fails on every parent render, ReportMapInner re-runs, and the layers useMemo sees onSelectMarker as a new reference, rebuilding all three ScatterplotLayers and calling DeckGLOverlay.setProps with a fresh layers array. This forces deck.gl to re-evaluate every accessor and re-upload attribute buffers to the GPU even though no data changed. The FullscreenMapOrchestrator codepath is safe (handleSelectMarker is stable via useCallback([])), but any future or existing non-fullscreen caller that omits useCallback will silently trigger per-frame GPU work.

_Fix:_ Remove onSelectMarker from the layers useMemo dep array and instead store it in a ref: const onSelectMarkerRef = useRef(onSelectMarker); useEffect(() => { onSelectMarkerRef.current = onSelectMarker; }, [onSelectMarker]); Inside the onClick handler use onSelectMarkerRef.current?.(object.id). The ref is always current without being a reactive dep, so layers only rebuild when reports, focusId, viewMode, or is3D change.

### `src/components/map/report-map.tsx` :164-191
**flyTo useEffect re-fires on is3D / zoom changes for already-focused marker, causing spurious camera animation**

The lastFlownIdRef guard (line 172) only prevents re-flying when focusId has not changed. If the user has a marker focused and then toggles 3D (is3D changes) or the parent passes a new zoom value, the effect re-runs. The guard sees lastFlownIdRef.current === focusId and hits the early return at line 173-175 (it calls setPopupReport(focused) and returns without flying, which is correct. However, if the user toggles is3D while a marker is focused AND the guard were removed (or gets bypassed), flyTo would be called twice. More concretely: zoom is in the deps but is also used in the flyTo call (Math.max(zoom, 15)). If the parent updates zoom for any reason (e.g., URL-driven zoom change), the effect fires again. For the currently focused marker the guard returns early, but for a freshly focused marker (lastFlownIdRef just set) a simultaneous zoom prop change would re-run the effect and call flyTo a second time in rapid succession with the new zoom) two overlapping animations. The separate is3D useEffect at line 200-208 already handles pitch changes, making is3D in the flyTo dep list redundant.

_Fix:_ Remove zoom and is3D from the flyTo effect's dependency array and read them via refs instead: const zoomRef = useRef(zoom); const is3DRef = useRef(is3D);, sync them in separate effects with no overlap. The flyTo effect should only trigger on [focusId, reports] to isolate camera-fly behavior from 3D/zoom bookkeeping that the dedicated effects already handle.

### `src/components/report/camera-capture.tsx` :99-101
**video.onloadedmetadata / oncanplay handlers call setReady after unmount**

markReady (which calls setReady(true)) is assigned to video.onloadedmetadata and video.oncanplay inside startCamera. The effect cleanup at lines 124-128 stops the stream tracks but never nulls out these handler properties. If the component unmounts while getUserMedia is resolving or after srcObject is set but before loadedmetadata fires (e.g. user navigates away mid-init), the video element fires its event, the stale setReady setter is called on an unmounted component, producing a React warning and potential state corruption in strict mode.

_Fix:_ Capture a reference to the video element inside startCamera and expose a cleanup that nulls the handlers. The cleanest fix: move handler attachment into the useEffect so the cleanup closure can reach the video ref, or at minimum add `streamRef.current && videoRef.current && (videoRef.current.onloadedmetadata = null, videoRef.current.oncanplay = null)` in the effect cleanup.

### `src/components/resident/updates-popover.tsx` :448-458
**MobileUpdatesSheet always returns null on first render, causing layout flash on mobile**

isMobile initialises to false (useState(false)), so MobileUpdatesSheet returns null on first client paint even on a mobile viewport. The desktop dropdown is hidden via CSS class 'hidden sm:block', so if open === true during this window (e.g. user opened popover before hydration settled), neither branch renders any content for one render cycle. On mobile this produces a visible blank flash and the user's tap appears to fail, then the sheet slides up on the next render. This is a structural hydration-first-paint mismatch for the mobile code path.

_Fix:_ Use a layout effect or initialise with `typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches` inside the useState initializer (which is safe because MobileUpdatesSheet is in a client component tree and only ever renders on the client). Alternatively, remove the isMobile gate entirely and rely on BottomSheet's own CSS/portal to avoid the double-render concern.

### `src/components/staff/staff-inbox.tsx` :115
**setTimeout in handleRefresh leaks on unmount and accumulates on rapid clicks**

`handleRefresh` (lines 102-116) calls `setTimeout(() => setIsRefreshing(false), 600)` with no cleanup. Two concrete failure paths: (1) User navigates away within 600ms (the timer fires, calling `setIsRefreshing` on an unmounted component (React 18 no-op, but still schedules a redundant reconcile). (2) User double-clicks Refresh) two timers are queued; the first sets `isRefreshing` to false prematurely while the second also fires, causing a double state update. Since `handleRefresh` is a `useCallback`, its reference is stable, but the timer itself is created inside the callback body with no `useRef` tracking or `useEffect` cleanup possible. The component has no mechanism to cancel the pending timer on unmount.

_Fix:_ Track the timer in a ref and cancel it on unmount:
```ts
const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// In handleRefresh, replace the setTimeout call:
if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
refreshTimerRef.current = setTimeout(() => setIsRefreshing(false), 600);

// Add a cleanup effect:
useEffect(() => {
  return () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  };
}, []);
```

### `src/components/staff/work-order-row.tsx` :93-102
**timeAgo() uses Date.now() during render, server/client timestamp divergence causes hydration mismatch**

`timeAgo(report.created_at)` (called at render time in both `WorkOrderRow` line 186 and `WorkOrderCard` line 346) calls `Date.now()` inside the function body (line 94). Next.js renders `"use client"` components on the server for the initial HTML payload, then hydrates on the client. The server renders `timeAgo` at request time (e.g. `"5m ago"`); by the time the client hydrates (network latency + JS parse/eval), `Date.now()` returns a later value, potentially producing a different string (e.g. `"6m ago"`). React detects the text node mismatch and logs a hydration error, then re-renders the cell, causing a visible flicker and console warnings. This affects every row in the table and every mobile card.

_Fix:_ Suppress the hydration mismatch by using `suppressHydrationWarning` on the text node, OR (better) defer `timeAgo` to client-only by wrapping in a `useEffect`/`useState` pattern:
```tsx
// In both WorkOrderRow and WorkOrderCard:
const [timeLabel, setTimeLabel] = useState('...');
useEffect(() => {
  setTimeLabel(timeAgo(report.created_at));
  const id = setInterval(() => setTimeLabel(timeAgo(report.created_at)), 60_000);
  return () => clearInterval(id);
}, [report.created_at]);
```
This also has the bonus of auto-updating the label as time passes. Alternatively, render the raw ISO date server-side and apply `timeAgo` only in a client `useEffect`.

### `src/components/teams/delegation-row-expanded.tsx` :202-237
**AI reasoning fetch has no AbortController, in-flight request continues after unmount / row collapse**

The `useEffect` at line 202 fires a `fetch('/api/ai/reasoning', ...)` with only a `cancelled` flag. The flag prevents `setState` after unmount but does NOT abort the HTTP request or stop reading the response body (`await res.json()` on line 221 runs unconditionally). When a user expands a delegation row (triggering the fetch) then collapses it before the response arrives, the component unmounts but the fetch and JSON parse continue consuming bandwidth and CPU. For a large AI reasoning payload across many rows this accumulates. Additionally, collapsing and quickly re-expanding (within the GSAP animation window) triggers a second fetch before the first completes. Both complete and the second result wins via the `cancelled` guard on the first, but both HTTP round-trips fire.

_Fix:_ Use `AbortController` in the effect: `const controller = new AbortController(); fetch(url, { ..., signal: controller.signal }); return () => controller.abort();`. Remove the manual `cancelled` flag. The `AbortError` thrown on abort is caught by the `catch` block, which should check `if (e instanceof DOMException && e.name === 'AbortError') return;` before setting error state.

### `src/components/teams/team-task-detail.tsx` :152-158
**TaskDetailPane Escape key listener re-registered on every parent render via unstable onClose reference**

`TaskDetailPane.useEffect` deps on `[onClose]`. The `onClose` prop is `() => setSelectedId(null)`, a new arrow function on every render of `TeamTasksInteractive`. Each parent re-render (e.g., task list scroll or corpus refresh) causes the keydown listener to be removed and re-added. While this does not produce a functional bug by itself, combined with any async gap between removal and addition (e.g., keyboard event fired during teardown) the Escape key press is silently dropped, leaving the pane stuck open. Under React 18 concurrent rendering the teardown → re-setup gap is non-zero.

_Fix:_ Wrap `onClose` in `useCallback` in `team-tasks-interactive.tsx`: `const handleClose = useCallback(() => setSelectedId(null), []);` and pass `handleClose` to `TaskDetailPane` and `TeamTaskDetail`. This makes the identity stable and eliminates all re-registrations.

### `src/components/teams/team-task-detail.tsx` :253
**PhotoBlock renders <img> / <Image> with empty-string src when photo_public_url is ""**

`PhotoBlock` accepts `src: string` (non-nullable). It is called at line 253 as `<PhotoBlock label="Before" src={report.photo_public_url} />`. `DashboardReport.photo_public_url` is typed as `string` but seed/demo data and real DB rows can produce an empty string `""` (e.g., a report submitted without a photo). When `src` is `""` and the path is not a data URL, the Next.js `<Image>` branch is taken. Next.js will attempt to optimize `""`, producing a request to the root path, a console error, and a broken image. The same applies to the `<img>` branch (the browser makes a request to the current page URL).

_Fix:_ Guard the `PhotoBlock` call: `{report.photo_public_url && <PhotoBlock label="Before" src={report.photo_public_url} />}`. Inside `PhotoBlock`, add an early return or a fallback `<ImageOff>` placeholder when `src` is falsy.

### `src/components/teams/team-tasks-interactive.tsx` :219
**TaskRow renders <img> with empty-string src, triggering a request to the base URL**

`<img src={report.photo_public_url} ...>` at line 219 is unconditional. When `photo_public_url` is `""`, the browser interprets this as a relative URL and fires a GET request to the current page URL (e.g., `GET /streets/cumming`). This produces a spurious HTML response rendered as an image, a broken image icon in the 48×48 thumbnail, and an unnecessary network request on every list render.

_Fix:_ Replace with `src={report.photo_public_url || undefined}` so the browser skips the request entirely when the value is empty, showing the `bg-[#0a0a0b]` placeholder instead.

### `src/components/ui/bottom-sheet.tsx` :46-53
**Concurrent BottomSheet instances will corrupt `document.body.style.overflow` on close**

The scroll-lock effect at lines 46-53 saves `document.body.style.overflow` before setting it to `'hidden'`, and restores it in cleanup. If two BottomSheet instances are open simultaneously (or one opens while another is closing), the second instance captures `prev = 'hidden'` (set by the first), and when it closes it restores `'hidden'`, keeping scroll locked even after both sheets are closed. The same pattern exists in `Drawer` at lines 57-65, so mixing Drawer + BottomSheet has the same issue. While unlikely in this codebase's current usage, it's a correctness trap whenever both are mounted.

_Fix:_ Use a reference counter stored on the document body instead of save/restore:
```ts
useEffect(() => {
  if (!open) return;
  const prev = document.body.style.overflow;
  const count = Number(document.body.dataset.scrollLock ?? 0) + 1;
  document.body.dataset.scrollLock = String(count);
  document.body.style.overflow = 'hidden';
  return () => {
    const next = Number(document.body.dataset.scrollLock ?? 1) - 1;
    document.body.dataset.scrollLock = String(Math.max(0, next));
    if (next <= 0) document.body.style.overflow = prev;
  };
}, [open]);
```
Apply the same fix in `drawer.tsx`.

### `src/components/ui/cobe-globe.tsx` :306-307
**Props like `dark`, `mapBrightness`, `markerColor` etc. are captured in the closure at `init()` time and never reflect subsequent prop changes**

The `animate` function (line 281) calls `globe!.update({...})` passing `dark`, `mapBrightness`, `markerColor`, `baseColor`, `arcColor`, `markerElevation`, `markers`, and `arcs`. These identifiers all refer to the values captured in the outer `useEffect` closure (i.e. the prop values at the time `init()` was called (which is the first render when `canvas.offsetWidth > 0`). Because the `useEffect` deps list at line 353 includes all these props, any prop change will destroy the entire globe and re-create it (since the effect re-runs). That means the `globe.update()` call is never actually executing with the fresh values) by the time props change, the old effect has cleaned up and a new effect (with new closure values) is running. This is logically correct but means the `globe.update()` pattern in `animate` (which is the reason `cobe` provides an `update` method) provides zero benefit here: the globe is always fully destroyed and re-created on any prop change rather than lively updated. This causes a visible flash/blink on prop change and unnecessarily stresses GPU init. Not a bug per se but a correctness/perf issue where the design intent (live prop updates via `update()`) is defeated by the exhaustive dep array.

_Fix:_ Move static config props (that don't need live update: `dark`, `diffuse`, `mapSamples`, `theta`, `speed`, `populate`, `markerSize`, etc.) out of the dep array and into a stable ref. Keep only `markers` and `arcs` (which users may legitimately need to swap) in deps. Use a separate effect that calls `globe.update()` for the truly live params. Or: accept the current behavior (full re-init on prop change) and document it, since for a demo globe this is acceptable.

### `src/components/ui/drawer.tsx` :57-65
**Same save/restore scroll-lock pattern as BottomSheet, corrupts overflow when Drawer and BottomSheet are simultaneously open**

Identical to the BottomSheet finding: `previous = document.body.style.overflow` is captured, body is set to `'hidden'`, and `previous` is restored on cleanup (lines 59-65). If BottomSheet is also open, the second component to close restores the first one's 'hidden' value rather than the original empty string, leaving scroll permanently locked.

_Fix:_ Apply the same reference-counter fix described in the BottomSheet finding.

### `src/lib/dashboard-data.ts` :355-407
**REPORT_CORPUS built with Date.now() at module-load time; per-request serverNow drifts ahead, causing inconsistent age calculations**

`buildCorpus()` is executed once when the module is first loaded by the Node worker (line 407: `const REPORT_CORPUS = buildCorpus()`). Inside `buildCorpus`, `const now = Date.now()` anchors all 1100 `created_at` timestamps at that single moment. Every subsequent request then passes a fresh `serverNow = Date.now()` to `FilterProvider` (city layout line 15, team layout line 31, staff/stats line 10). By the time any request arrives, `serverNow` is already ahead of the corpus anchor by at least a few milliseconds in dev or potentially hours/days in a long-lived production worker. `FilterProvider` uses `serverNow` (via `nowRef`) for all windowing math (`filterReports`, `filterPreviousWindow`), but `created_at` strings were anchored to an earlier `Date.now()`. The drift means a report whose `created_at` says '5 days ago' (relative to corpus-build time) appears '5 days + Δ ago' to the filter, shrinking the 'this week' window as the server process ages. `fetchCityStats` uses the module-level `age_days` (correct relative to corpus-build time) while `FilterProvider` uses `serverNow` (correct relative to request time): the two counts of 'this week' reports diverge. The stat tile and the filter bar will show different 'this week' values.

_Fix:_ Pass the corpus-baked `now` alongside the corpus so both the stat functions and the `FilterProvider` use the same reference epoch. Expose it from `dashboard-data.ts`: `export const CORPUS_NOW: number = /* captured during buildCorpus */;` and use `CORPUS_NOW` as the `now` prop everywhere instead of a fresh `Date.now()` per request. Alternatively, switch `getReportCorpus()` to accept a `now` argument and rebuild on each call (expensive but consistent), or accept the drift as a known limitation of the demo data layer.

### `src/lib/dashboard-data.ts` :422-424
**getReportCorpus() allocates a new 1100-element array on every call with no per-request memoization**

getReportCorpus() calls REPORT_CORPUS.map(stripCorpus) unconditionally on every invocation (line 423). It is called at least three times per resident page request: demoReporterId() (resident-data.ts line 114), getMyReports() (line 217), and getCityMorale() (line 293), plus indirectly through getMyReport. Each call allocates and GC-pressures a fresh 1100-element DashboardReport array. Compare fetchCity in dashboard-queries.ts which wraps its equivalent in React's cache() for per-request deduplication. The corpus content never changes within a request (it is a module-level constant), so all callsites within one request pay identical allocation cost for identical data.

_Fix:_ Wrap getReportCorpus with React's cache() so repeated calls within the same request are collapsed to a single allocation. Add: import { cache } from 'react'; then export const getReportCorpus = cache((): DashboardReport[] => REPORT_CORPUS.map(stripCorpus)); The cache boundary resets per request so stale cross-request references are not possible.

### `src/lib/demo-reports.ts` :192-207
**useDemoReports: localStorage-persisted demo reports flash absent on first client render**

useSyncExternalStore (line 197) returns the server snapshot (EMPTY = []) on initial render and during hydration. The useEffect on line 193 fires after paint and calls hydrateOnce(), which reads localStorage and calls emit() to trigger a re-render with the real snapshot. This means on every page load where demo reports were previously injected and persisted to localStorage, the map (and any other consumer of demoReports) renders a first frame with zero demo markers, then a second frame adds them back. On a slow paint or with many consumers, this causes a visible marker-pop. The gap exists because hydrateOnce is deferred to useEffect rather than running synchronously before the first useSyncExternalStore snapshot is returned.

_Fix:_ Call hydrateOnce() outside of useEffect, directly at module level (after the variable declarations), guarded by typeof window !== 'undefined'. This runs synchronously during client-side module evaluation (before any component mounts), so snapshot is already populated when useSyncExternalStore returns its first client snapshot. The server guard (typeof window === 'undefined' check inside hydrateOnce) makes this safe for SSR. Remove the useEffect call from useDemoReports. Apply the same change to category-overrides.ts which has the identical pattern.

### `src/lib/teams-overrides.ts` :221-231
**Shared subscribe function causes unnecessary snapshot checks on history-only mutations**

Both `useSyncExternalStore` calls (line 221 for `overrides`, line 227 for `history`) share the same `subscribe` / `listeners` set. When `setReportTeam` fires, it updates BOTH `snapshot` and `historySnapshot`, then calls `emit()` once. React processes both subscriptions and checks both snapshots. This is fine when both change. However, if a future mutation path changes only one (e.g. a batch that clears history without changing team assignments), React will still notify both subscriptions and call both `getSnapshot` and `getHistorySnapshotInternal`. If the unchanged snapshot reference is stable (same object identity), `useSyncExternalStore` bails out with no re-render for that subscription. But this relies on the caller never accidentally creating a new object when the data hasn't changed. Currently all mutations always change both, so the bug is latent. More concretely: `FilterProvider` subscribes to `overrides` from `useTeamOverrides()`; any history-only emit would still cause the `overrides` store to re-check its snapshot, and if identity held stable React would bail out. The risk is low now but grows as mutation paths are added.

_Fix:_ Split the listeners set into two separate sets (one for overrides, one for history) with two separate `subscribe` functions:
```ts
const overrideListeners = new Set<() => void>();
const historyListeners = new Set<() => void>();
function emitOverrides() { for (const l of overrideListeners) l(); }
function emitHistory() { for (const l of historyListeners) l(); }
function subscribeOverrides(l: () => void) { overrideListeners.add(l); return () => overrideListeners.delete(l); }
function subscribeHistory(l: () => void) { historyListeners.add(l); return () => historyListeners.delete(l); }
```
Then pass `subscribeOverrides` and `subscribeHistory` to the respective `useSyncExternalStore` calls. Call only the relevant `emit*` per mutation.

## Low (12)

### `src/app/login/login-form.tsx` :29-34
**useEffect on initialError blindly resets user-generated error state on URL param changes**

`error` state is initialized to `initialError` (the `?error=` query param) on line 29. The `useEffect` at lines 32-34 re-sets error to `initialError` whenever the search param changes. If the user clears the URL (browser back button, `router.replace`) after setting a new error via a failed email/guest sign-in attempt, `initialError` becomes null, the effect fires, and resets `error` to null, silently swallowing the sign-in error the user just saw. The effect also has no inverse: if the URL had `?error=X` and the user then triggers a new error `Y`, a URL change unrelated to login (e.g., hash change, query param added) would overwrite `Y` with `initialError` again. Confidence: 82.

_Fix:_ Remove the useEffect entirely. The useState initializer `useState<string | null>(initialError)` already captures the initial URL error on first mount. `useSearchParams()` in Next.js is reactive but the error state is intentionally one-way: once the user interacts with the form, the error should be driven by form logic, not URL params. If re-sync is genuinely needed, gate it: `useEffect(() => { if (initialError) setError(initialError); }, [initialError]);` already exists but the condition should be extended to avoid overwriting non-URL errors: track whether the current error came from the URL or from a form action.

### `src/app/report/page.tsx` :291-311
**One-shot fetch inside .subscribe() callback can call setState after cleanup runs**

The `.subscribe()` callback fires the one-shot fetch (lines 297-311) asynchronously. If the component unmounts between the `subscribe` callback firing and the `.then()` resolving, the cleanup function (line 313-316) has already called `clearTimeout(timeout)` and `supabase.removeChannel(channel)`. The inflight `.then()` still resolves and calls `applyRow`, which calls `clearTimeout` (already cleared, benign) and `setStep` on an unmounted component. React 18 makes `setStep` a no-op on unmount but the channel call to `applyRow` after `removeChannel` is still live. More concretely: if the user navigates away while the classify job is still pending, the cleanup removes the channel but the inflight fetch still resolves and tries to mutate state.

_Fix:_ Add an `active` flag in the effect scope, set it to `false` in the cleanup, and guard `applyRow` with it: `let active = true; const applyRow = (row) => { if (!active) return; ... }; return () => { active = false; clearTimeout(timeout); supabase.removeChannel(channel); };`

### `src/app/report/page.tsx` :88-108
**navigator.geolocation.getCurrentPosition has no cancellation on unmount**

`navigator.geolocation.getCurrentPosition` is not cancellable via AbortController. The success callback (line 100-102) calls `setLocation` and `setGpsStatus`, and the error callback (line 103-105) calls `setGpsStatus`. If the component unmounts before GPS resolves (user navigates away during the 10-second timeout), these callbacks still fire and attempt state updates on an unmounted component. React 18 treats these as no-ops but emits a dev-mode warning. The `gpsRequested` ref guard (line 90) only prevents double-invocation, not post-unmount callback execution.

_Fix:_ Track an `active` flag in the effect and guard the callbacks: `let active = true; navigator.geolocation.getCurrentPosition((pos) => { if (active) { setLocation(...); setGpsStatus('found'); } }, () => { if (active) setGpsStatus('manual'); }, ...); return () => { active = false; };`

### `src/components/analytics/bento-primitives.tsx` :133-145
**ExpandModal Escape-key effect re-runs whenever onClose identity changes, briefly removing the keydown listener**

The effect dep array includes onClose. At the call site in analytics-interactive.tsx line 102, onClose is an inline arrow: onClose={() => setExplorerOpen(false)}. This arrow is a new function reference on every parent render. Whenever AnalyticsInteractive re-renders (e.g., any filter state change), open=true and onClose changes → the effect cleanup runs (removes the keydown listener) and the effect body runs again (re-adds it). The window is briefly without a keydown listener between the removal and re-add, in practice sub-millisecond, but the pattern unnecessarily fires body.style.overflow writes on every parent re-render while the modal is open. Fix: memoize the onClose prop at the call site with useCallback, or inside ExpandModal store onClose in a ref and use the ref in onKey so the dep array can be [open] only.

_Fix:_ Inside ExpandModal, store onClose in a ref: const onCloseRef = useRef(onClose); useEffect(() => { onCloseRef.current = onClose; }); then use onCloseRef.current inside onKey, and change the effect dep array to [open] only.

### `src/components/city/city-switcher.tsx` :38-57
**`onPointer` inside the `useEffect` captures `open` as `true` (effect only runs when `open` is true) but this is correct; however `setOpen(false)` is called unconditionally on outside pointer, if `open` changes to false externally between the time the effect registered the listener and the pointerdown event, the listener still runs and calls `setOpen(false)` (a no-op). Clean.**

_Fix:_ No fix required, marking as verified clean after thorough analysis.

### `src/components/landing/wave-hero.tsx` :98-103
**When `reducedMotion` is true the effect returns without a cleanup function, but `resize()` sets canvas dimensions and returns; no listener or observer was created, so this is actually safe. However `renderFrame(0)` is called immediately after `resize()` which sets `data = img.data` only when `img` is non-null. If `canvas.clientWidth === 0` and `window.innerWidth === 0` (e.g. headless test environment), `bw` and `bh` are both 1 (guarded by `Math.max(1,...)`), so `img` is always constructed. This path is clean.**

Confirmed safe: the `Math.max(1, ...)` guard on lines 99-100 ensures `bw >= 1` and `bh >= 1`, so `ctx.createImageData(bw, bh)` always succeeds and `data` is non-null before `renderFrame(0)` is called on line 187. The early return on line 188 leaves no dangling listeners or observers. No bug.

_Fix:_ No fix required. The reduced-motion path is correctly bounded.

### `src/components/report/photo-preview.tsx` :31
**URL.createObjectURL called in useMemo, unsafe if component is ever SSR'd**

useMemo runs synchronously during render. URL.createObjectURL is a browser-only API. While the current 'use client' directive prevents SSR today, any future move of this component above a Suspense/error-boundary boundary that forces server rendering (or accidental removal of the directive) will throw ReferenceError: URL is not defined inside the render phase, producing an uncaught error with no fallback shown.

_Fix:_ Move the object URL creation into a useEffect + useState pattern: `const [previewUrl, setPreviewUrl] = useState(''); useEffect(() => { const url = URL.createObjectURL(photo); setPreviewUrl(url); return () => URL.revokeObjectURL(url); }, [photo]);` This also makes the revoke cleanup simpler and self-contained.

### `src/components/teams/delegation-panel.tsx` :129-141
**Inline arrow functions as onReassign/onClear props recreated on every DelegationPanelInner render**

At lines 139-140, `onReassign={(teamId) => setReportTeam(r, teamId)}` and `onClear={() => clearReportTeam(r)}` are new function literals on every render. `DelegationRow` is not wrapped in `memo`, so this does not defeat a memo boundary, but any future memoization of `DelegationRow` would silently fail. Each state update in `DelegationPanelInner` (e.g., `setShowAll`) forces every visible row to receive new prop references, causing full reconciliation of all GSAP-animated rows. With up to 30 rows this is non-trivial.

_Fix:_ Since `r` is loop-bound and `DelegationRow` is already a separate component, the cleanest fix is to memoize `DelegationRow` and stabilize the callbacks: pass `report={r}`, `onReassign={setReportTeam}`, `onClear={clearReportTeam}` and let the row call `onReassign(report, teamId)` internally. This makes all props in the row referentially stable between renders.

### `src/lib/ai/rate-limiter.ts` :37-41
**Array.shift() in prune() is O(n), degrades under sustained high-rate traffic**

`prune()` calls `w.timestamps.shift()` in a while loop. `Array.prototype.shift()` is O(n) in V8 because it reindexes every remaining element. For the configured default of 40 RPM / 300 RPH / 1500 RPD, pruning is bounded and negligible at those scales. However, if `GEMINI_RPM`/`GEMINI_RPH`/`GEMINI_RPD` env vars are raised significantly (e.g. thousands), the prune loop becomes a real synchronous bottleneck on the hot path of every AI request. The module-level arrays also grow to capacity before pruning, never releasing memory between cold starts.

_Fix:_ Use a pointer/index instead of mutating the array, or use a proper circular buffer / Uint32Array with a head pointer:
```ts
let head = 0;
function prune(w: Window): void {
  const cutoff = Date.now() - w.maxMs;
  while (head < w.timestamps.length && w.timestamps[head] < cutoff) head++;
  if (head > w.timestamps.length / 2) {
    w.timestamps = w.timestamps.slice(head);
    head = 0;
  }
}
```
For this project's actual limits, this is a minor concern.

### `src/lib/analytics-data.ts` :99-113
**fetchReportsTrend calls Date.now() independently, misaligning trend dates with getCityMorale week boundaries**

getCityMorale in resident-data.ts captures const now = Date.now() at line 299 and uses it to compute resolvedThisWeek / reportedThisWeek with a 7-day boundary. It then awaits fetchReportsTrend (line 324) which calls its own Date.now() (analytics-data.ts line 99) to anchor the 14-day date series. The two Date.now() calls happen milliseconds apart under normal load, but their independently chosen 'today' can disagree on the most recent date label when the first call straddles midnight and the second crosses it. More importantly, each SSR render produces a different set of date strings in the trend array, preventing any HTTP-level caching of the rendered output.

_Fix:_ Accept an optional now parameter in fetchReportsTrend (and other analytics functions that call Date.now() internally) and pass getCityMorale's captured now through: async function fetchReportsTrend(cityId: string, days = 14, now = Date.now()). Call it as fetchReportsTrend(city?.id ?? '', 14, now) from getCityMorale so both functions share the same reference point. This also makes the trend output deterministic for a given request timestamp, enabling RSC/CDN caching.

### `src/lib/category-overrides.ts` :99-137
**useCategoryOverrides: same localStorage-hydration flash as demo-reports, overrides absent on first render**

Identical pattern to demo-reports.ts: hydrateOnce() is called in useEffect (line 100), so on the first render useSyncExternalStore returns EMPTY ({}) even when localStorage contains routing overrides. Routing-matrix UI components consuming useCategoryOverrides will render with no overrides applied, then re-render with the real overrides after paint. If those components use overrides to conditionally render team assignments, dispatchers see a frame where every category shows its default team before the override pops in.

_Fix:_ Same as demo-reports: call hydrateOnce() at module level (outside any function) guarded by typeof window !== 'undefined'. Remove the useEffect(() => { hydrateOnce(); }, []) from useCategoryOverrides. The typeof window guard in hydrateOnce already makes the call safe during SSR (it returns early). This ensures snapshot is pre-populated before any component renders on the client.

### `src/lib/filters/context.tsx` :139-148
**categoryOverrides dep forces filtered/previousWindow recompute but filterReports reads module singleton directly**

`useMemo` on lines 142-148 lists `categoryOverrides` as a dependency solely to force recomputation when category routing changes (as noted by the comment on line 137-139). However, `filterReports` does not receive `categoryOverrides` as an argument (it reads the category mapping indirectly via `categoryToTeam()` which reads the `category-overrides` module-level `snapshot`. This means: (a) the memo invalidates correctly on routing change, which is the intended behaviour; but (b) if `categoryOverrides` reference changes WITHOUT the underlying data changing (e.g. a spurious re-render of `useCategoryOverrides` returning a new object identity), the expensive `filterReports` call over the whole corpus runs unnecessarily. `useSyncExternalStore` returns stable references (same object identity until `snapshot` is reassigned), so this is currently safe. But the dependency is semantically a lie) the memo depends on the module-level singleton, not the React state value, and this coupling is invisible to React's dependency tracking.

_Fix:_ Either (a) pass `categoryOverrides` into `filterReports` explicitly so the dependency is honest, or (b) replace the `categoryOverrides` dep with a version counter that increments inside `setCategoryTeam`/`clearCategoryTeam`/`clearAll` in `category-overrides.ts`, making the invalidation signal explicit without passing the full map:
```ts
// category-overrides.ts. Add:
let version = 0;
export function getCategoryOverridesVersion() { return version; }
// increment version in emit()
```
Then in context.tsx:
```tsx
const categoryVersion = useSyncExternalStore(subscribeVersion, getVersion, () => 0);
// dep: [corpus, filter, now, overrides, categoryVersion]
```
This makes the relationship explicit and avoids any risk of object-identity churn from the current approach.



---

## Resolution (applied 2026-06-07)

Fixed via opus agent swarms (one fixer per file; each confirmed the bug against live code, rejecting partition false-positives), then an adversarial re-review swarm (9 reviewers over the diff) that caught 8 issues, 6 fixed, 2 skipped (pre-existing / optional).

**Outcome:** 38 files changed + 1 new (`src/lib/utils/scroll-lock.ts`), +1039 / −751.

**Verification gate (all green):**
- `tsc --noEmit`: clean
- `pnpm build`: clean. 43 routes generated
- biome substantive rules: back to exact session baseline (useExhaustiveDependencies 10, useIterableCallbackReturn 2, noGlobalIsNan 9, noArrayIndexKey 5), **zero net-new** issues introduced

**Notable cross-file fixes:**
- `reasoning/route.ts`: timing-safe compare now uses `Buffer.byteLength` (string `.length` could throw `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` on a multi-byte secret → uncaught 500).
- Unified body-scroll lock into a single reference-counted `scroll-lock.ts` (6 overlays previously each had a naive save/restore that clobbered each other).
- `resident-data.ts`: trend now shares the request timestamp (was straddling midnight).

**Regressions the re-review caught & fixed (would have shipped otherwise):**
- `category-overrides.ts`: a fixer moved store hydration from `useEffect` to module-eval, reintroducing an SSR/hydration mismatch on team-scoped views (the project's known failure class). Reverted to post-commit `useEffect` hydration.
- `report/page.tsx`: a stale `gpsRequested` ref guard plus the new `active` flag deadlocked the GPS step forever under React StrictMode (dev). Removed the ref guard.

**Skipped (not regressions):** `audit.ts` 1000-file bucket cap (pre-existing limitation); raw PostgREST error messages were sanitized to error codes.
