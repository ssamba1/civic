export const meta = {
  name: 'haiku-dev-audit',
  description: 'Fan 20 Haiku agents across the repo; each writes one audit report to dev-audit/',
  phases: [{ title: 'Audit', detail: '20 read-only Haiku sweeps, one report file each' }],
}

const ROOT = 'c:/Hackathon/-Social-Impact-'

// 20 report-only dev-grind tasks. Each agent is READ-ONLY except for writing its own
// single report file. Distinct output paths => zero conflict, safe to run all at once.
const TASKS = [
  { n: '01', slug: 'test-coverage-gaps', title: 'Test coverage gap map',
    body: 'Repo has 202 ts/tsx files but only 11 *.test.ts. List every src/lib/**.ts WITHOUT a colocated *.test.ts. For each, rate test priority (high/med/low) by how much logic it holds and whether it is pure/easily testable. Group by directory. Recommend the 15 highest-value files to test first and why.' },
  { n: '02', slug: 'any-and-loose-types', title: 'any / loose-type inventory',
    body: 'Find every use of `any`, `as any`, `as unknown`, `@ts-ignore`, `@ts-expect-error`, and implicit-any-prone patterns across src/. Report file:line, the offending snippet, and a suggested narrower type. Rank by risk.' },
  { n: '03', slug: 'dead-code', title: 'Dead code & unused exports',
    body: 'Find unused exports, unreferenced files, unused imports, and unreachable code in src/. Cross-check each exported symbol against imports elsewhere. Report file:line + confidence (a symbol used only in its own file but exported = likely dead). Also flag stray repo-root files (e.g. multiple civic_outreach*.csv backups, tsconfig.tsbuildinfo) that look committed-by-accident.' },
  { n: '04', slug: 'accessibility', title: 'Accessibility audit',
    body: 'Sweep every src/**/*.tsx. Flag: <img> missing alt, icon-only buttons missing aria-label, form inputs missing labels/htmlFor, click handlers on non-interactive elements, missing focus states, likely low-contrast utility classes, missing role on custom widgets. Report file:line + the fix. Group by severity.' },
  { n: '05', slug: 'error-handling', title: 'Error-handling audit',
    body: 'Find unhandled promise rejections, awaited calls with no try/catch around AI/db/network (Gemini, supabase, fetch), empty/swallowed catch blocks, and thrown values that are not Error. Focus on src/lib/ai, src/lib/db, src/app/api, server actions. Report file:line + risk + fix.' },
  { n: '06', slug: 'todo-fixme-harvest', title: 'TODO / FIXME / HACK backlog',
    body: 'Grep all TODO, FIXME, HACK, XXX, @todo, "temporary", "for now", "hack" across src/ and docs/. Collect into one prioritized backlog table: file:line, the note, inferred effort (S/M/L), inferred priority. Note any that look like shipped-but-unfinished features.' },
  { n: '07', slug: 'readme-docs-drift', title: 'README / docs drift',
    body: 'Verify README.md and docs/ claims against actual code. Check: the API route table vs files under src/app/api, env vars in README vs .env.example vs actual process.env usage, the data-model table vs supabase migrations, feature-status checkmarks vs whether the code exists. Report each drift: claim, reality, file evidence.' },
  { n: '08', slug: 'dependency-audit', title: 'Dependency audit',
    body: 'Compare package.json dependencies against actual imports in src/. List: declared deps never imported (candidates to remove), packages imported but not declared, heavy client-side deps (deck.gl, gsap, maplibre, cobe) and where they load. Do NOT run npm; reason from package.json + import grep only.' },
  { n: '09', slug: 'repo-hygiene', title: 'Repo hygiene & gitignore gaps',
    body: 'Audit repo root + .gitignore. Flag: build artifacts that may be committed (.next, tsconfig.tsbuildinfo), the 6 stray civic_outreach*.csv / *_review*.csv backups, duplicate/NEW/before* files, secrets risk in .env.local vs .env.example. Recommend gitignore additions and which files to delete/move into leadgen/. List exact paths.' },
  { n: '10', slug: 'debug-cruft', title: 'console.log / debug cruft',
    body: 'Find console.log/debug/info/warn, leftover debugger statements, and ad-hoc debug code in src/. Distinguish intentional logging (logger.ts) from stray console.*. Report file:line + recommend keep/remove.' },
  { n: '11', slug: 'magic-values', title: 'Magic numbers & hardcoded config',
    body: 'Find hardcoded values that should be constants or env: magic numbers (timeouts, limits, radii, thresholds), hardcoded URLs/hosts, hardcoded category lists duplicated across files, hardcoded colors outside the design system. Report file:line + suggested home (const, config, env).' },
  { n: '12', slug: 'route-boundary-coverage', title: 'Loading / error boundary coverage',
    body: 'For each route segment under src/app, check which have loading.tsx and error.tsx and which do not. Flag async route/data-fetching segments missing a loading or error boundary. Output a table: route, has loading?, has error?, recommendation.' },
  { n: '13', slug: 'open311-compliance', title: 'Open311 compliance check',
    body: 'Review src/lib/open311/ and src/app/api/open311/. Check the GeoReport v2 spec surface: services, requests, request-by-id, required fields, XML/JSON content negotiation, error formats. List spec gaps and deviations with file evidence. (Use general knowledge of Open311 GeoReport v2.)' },
  { n: '14', slug: 'ai-pipeline-robustness', title: 'AI pipeline robustness review',
    body: 'Review src/lib/ai/* (gemini, classify-pipeline, classification-schema, rate-limit, rate-limiter, retry, work-order-rules, reasoning-ai, prompt, config). Check: schema validation of model output, retry/backoff correctness, rate-limit correctness, prompt-injection surface, what happens on malformed/empty model response, two rate-limit files (rate-limit.ts vs rate-limiter.ts) duplication. Report risks + file:line.' },
  { n: '15', slug: 'security-smells', title: 'Security smell scan',
    body: 'Scan for: secrets/keys in source, missing auth checks on API routes and server actions, unvalidated user input reaching db/AI/fs, SSRF in fetch, unsafe dangerouslySetInnerHTML, open redirects, signed-url/upload handling in src/lib/privacy. Report file:line + severity + fix. Defensive review only.' },
  { n: '16', slug: 'naming-consistency', title: 'Naming & convention consistency',
    body: 'Audit naming consistency across src/: file naming (kebab vs camel), component vs util naming, export style (default vs named), inconsistent terms for the same concept (resident/user/citizen, staff/city/gov, report/incident/request). Report inconsistencies + recommend the canonical term per concept.' },
  { n: '17', slug: 'import-hygiene', title: 'Import hygiene',
    body: 'Find: deep relative import chains (../../..), potential circular dependencies, inconsistent path-alias usage (@/ vs relative), client components importing server-only modules or vice versa, barrel-file overuse. Report file:line + fix.' },
  { n: '18', slug: 'privacy-module-review', title: 'Privacy module review',
    body: 'Deep review of src/lib/privacy/ (audit, blur, face-detector.d.ts, retention, signed-url, upload). Check: face/PII blur actually applied before storage, signed-url expiry, retention enforcement, audit-log completeness, upload validation (the image/sniff-mime usage). Report gaps + file:line.' },
  { n: '19', slug: 'demo-mode-branching', title: 'Demo-mode vs live branching audit',
    body: 'Trace NEXT_PUBLIC_DEMO_MODE / demo-mode.ts / demo-auth.ts / demo-reports.ts / demo-session.ts usage across src/. Map every place behavior forks on demo vs live. Flag dead branches, demo code reachable in production, and live paths untested in demo. Output the fork map + risks.' },
  { n: '20', slug: 'perf-smells', title: 'Client-perf smells',
    body: 'Find performance smells in React/Next: large "use client" components that could be server, heavy libs (deck.gl/gsap/maplibre/cobe) imported eagerly instead of lazy, missing memo/useMemo on expensive renders, big lists without virtualization, images without next/image, unnecessary client state. Report file:line + fix + estimated impact.' },
]

phase('Audit')

const COMMON = (t) => `You are a read-only code auditor on a Next.js 16 + React 19 + TypeScript civic-reporting app.
Repo root: ${ROOT}
Use Read/Grep/Glob to investigate. DO NOT edit any source files.

TASK, ${t.title}:
${t.body}

Be concrete: every finding cites file:line. No vague advice. Prioritize. If a concern is clean, say so explicitly rather than padding.

When done, WRITE your full markdown report to this exact path (create/overwrite it):
${ROOT}/dev-audit/${t.n}-${t.slug}.md
Start the file with a "# ${t.title}" heading and a 3-line summary (counts + top issue), then the detailed findings table.

Return ONLY a one-line status: "${t.n} ${t.slug}: <N findings, top= ...>".`

const results = await parallel(TASKS.map((t) => () =>
  agent(COMMON(t), { label: `${t.n}-${t.slug}`, phase: 'Audit', model: 'haiku' })
))

const lines = results.map((r, i) => r ? r.trim() : `${TASKS[i].n} ${TASKS[i].slug}: FAILED/SKIPPED`)
log(`Audit done. ${results.filter(Boolean).length}/${TASKS.length} reports written to dev-audit/`)
return { summary: lines, written: results.filter(Boolean).length, total: TASKS.length }
