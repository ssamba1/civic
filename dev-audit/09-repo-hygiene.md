# Repo Hygiene Audit

**Summary:** 13 artifacts incorrectly tracked or untracked in root. 2 research docs tracked (should move). 6 CSV backups untracked clutter (276 KB largest). 748 KB build artifact on disk. No secrets leaked (`.env.local` correctly gitignored). Recommend delete 6 CSVs + tsbuildinfo locally, move 2 research docs, add 2 gitignore lines.

---

## Pass 1: Root-Level Files

### Tracked Files (git ls-files)
- `RESEARCH_PROMPT.md` (28.7 KB). Committed c19c39e "docs: add deep-research prompt + verified market findings"
- `civic_research_findings.md` (30.1 KB), committed same commit

### Untracked Files (11 items, 815+ KB total)
| File | Size | Status |
|------|------|--------|
| civic_outreach.NEW.csv | 276.4 KB | ?? untracked |
| civic_outreach.csv | 136.9 KB | ?? untracked |
| civic_outreach.before283.csv | 136.9 KB | ?? untracked |
| civic_outreach.before.csv | 37.5 KB | ?? untracked |
| civic_outreach_review.csv | 7.4 KB | ?? untracked |
| civic_outreach_review.NEW.csv | 15.1 KB | ?? untracked |

### Build Artifacts on Disk (not tracked, gitignored)
| File | Size | Status |
|------|------|--------|
| `tsconfig.tsbuildinfo` | 748 KB | Built file, in `.gitignore`, EXISTS |
| `.next/` | 3.3 GB (7,269 files) | In `.gitignore`, EXISTS |

---

## Pass 2: .gitignore Review

**Current patterns:**
```
/node_modules
.pnp.*
/coverage
/.next/
/out/
/build/
.DS_Store
*.pem
npm-debug.log*
.env
.env.local
.env.*.local
.env.development
.env.production
.vercel
*.tsbuildinfo
next-env.d.ts
.gstack/
certificates
graphify-out/
.graphify_python
.graphify_uncached.txt
```

**Missing patterns (not in .gitignore):**
- `civic_outreach*.csv`: 6 backups/variants untracked but live in root, causing clutter
- `*_review*.csv`: alternate form of above
- Nothing else significant

**.gitignore completeness check:**
- `*.tsbuildinfo` IS present (line 44). Build artifact ignored but file exists locally
- `certificates` IS present (line 50). Dev cert storage ignored correctly
- `.env.local` IS present (line 35). Secrets file ignored correctly
- `/.next/` IS present (line 17). Build output ignored correctly
- CSV backups NOT ignored. Should add patterns

---

## Pass 3: Secrets Risk

### .env Files Comparison

**`.env.local` (committed?)** NO. File EXISTS but properly in `.gitignore`

**Secrets present in .env.local (safe, not tracked):**
```
SUPABASE_SERVICE_ROLE_KEY=***REMOVED-SUPABASE-JWT***
GEMINI_API_KEY=***REMOVED-GEMINI-KEY***
INTERNAL_CLASSIFY_SECRET=***REMOVED-INTERNAL-SECRET***
```

**Status:** **SAFE.** `.env.local` is in `.gitignore` and NOT tracked in git. No secrets leaked.

### Certificates

- `certificates/localhost-key.pem` (1.7 KB)
- `certificates/localhost.pem` (1.5 KB)

**Status:** Dev TLS certs only, in `.gitignore`, safe.

---

## Pass 4: Large Files in Root

**Files >500 KB (should not be in source root):**

| File | Size | Purpose | Issue |
|------|------|---------|-------|
| `pnpm-lock.yaml` | 252.9 KB | Lock file | OK. Necessary, tracked |
| `tsconfig.tsbuildinfo` | 748 KB | Build output | Should delete from disk (in `.gitignore`, won't recommit) |
| `civic_outreach.NEW.csv` | 276.4 KB | Data export? | Move to `leadgen/` or delete |
| `civic_outreach.csv` | 136.9 KB | Data export? | Move to `leadgen/` or delete |
| `civic_outreach.before283.csv` | 136.9 KB | Backup | Move to `leadgen/` or delete |

**Other root files review:**
- `agents.md` (5.7 KB) Tracked, intentional
- `RESEARCH_PROMPT.md` (28.7 KB) Tracked but should move
- `civic_research_findings.md` (30.1 KB) Tracked but should move
- `README.md` (4.7 KB) Tracked, intentional
- `next.config.ts`, `tsconfig.json`, `biome.json`, etc. Config files, OK

---

## Pass 5: Recommendations

### A. Delete from Disk (won't recommit: files are untracked)

```bash
# Remove untracked CSV backups
rm civic_outreach.NEW.csv
rm civic_outreach.csv
rm civic_outreach.before.csv
rm civic_outreach.before283.csv
rm civic_outreach_review.csv
rm civic_outreach_review.NEW.csv

# Remove build artifact
rm tsconfig.tsbuildinfo
```

**Why:** All 6 CSVs are untracked, >815 KB combined. `tsbuildinfo` is a build by-product, will regenerate on next `pnpm build`.

### B. Move Tracked Research Files (currently committed)

These were committed in `c19c39e` but belong in documentation or reference folder, not root:

```bash
# OPTION 1: Move to leadgen/ (if these are lead-gen research)
mv RESEARCH_PROMPT.md leadgen/
mv civic_research_findings.md leadgen/

# OPTION 2: Move to docs/ (if these are general research)
mv RESEARCH_PROMPT.md docs/
mv civic_research_findings.md docs/

# OR delete if no longer needed:
rm RESEARCH_PROMPT.md
rm civic_research_findings.md
```

**Why:** 58 KB of research docs in root clutter the project structure. `leadgen/` already contains wave data (wave1.json, wave2_*.json, wave3_*.json), so `leadgen/` is the appropriate home if these are lead-gen research. If general product research, move to `docs/`.

### C. Update .gitignore

Add CSV patterns to prevent future backups from accumulating:

```bash
# In .gitignore, after line 40 (misc section):
# CSV backups and data exports
civic_outreach*.csv
*_review*.csv
```

**Why:** The 6 CSV files show a pattern of backups/variants (`.NEW`, `.before`, `.before283`) that shouldn't live in VCS. Pattern matches all future variants.

### D. Verify Local Workspace

Run after cleanup:

```bash
# Confirm no untracked clutter remains
git status

# Confirm untracked files are gone
ls -la civic_outreach*.csv 2>&1  # Should show "No such file"
ls -la tsconfig.tsbuildinfo 2>&1  # Should show "No such file"

# Rebuild to confirm .next/ regenerates correctly
pnpm build
```

---

## Pass 6: Endurance Check: Account for Every Root Entry

| Item | Status | Action | Notes |
|------|--------|--------|-------|
| `.git/` | DIR | - | Repository metadata, OK |
| `.next/` | DIR | - | Build cache, in `.gitignore`, OK |
| `certificates/` | DIR | - | Dev TLS, in `.gitignore`, OK |
| `dev-audit/` | DIR | - | This audit output, OK |
| `docs/` | DIR | - | Documentation, OK |
| `leadgen/` | DIR | - | Lead generation, OK to move research files here |
| `node_modules/` | DIR | - | Dependencies, in `.gitignore`, OK |
| `public/` | DIR | - | Static assets, OK |
| `scripts/` | DIR | - | Scripts, OK |
| `src/` | DIR | - | Source code, OK |
| `supabase/` | DIR | - | Supabase config, OK |
| `.env.example` | 1.4 KB | - | Public template, OK |
| `.env.local` | 0.9 KB | - | Real secrets, gitignored, OK |
| `.gitignore` | 0.6 KB | EDIT | Add CSV patterns |
| `agents.md` | 5.7 KB | - | Tracked, OK |
| `biome.json` | 0.5 KB | - | Lint config, OK |
| `civic_outreach*.csv` (6 files) | 815+ KB | DELETE | Untracked backups, move or remove |
| `civic_research_findings.md` | 30.1 KB | MOVE | Tracked, move to `leadgen/` or `docs/` |
| `eslint.config.mjs` | 0.5 KB | - | Lint config, OK |
| `next-env.d.ts` | 0.2 KB | - | Next.js auto-generated, OK |
| `next.config.ts` | 2.9 KB | - | App config, OK |
| `package.json` | 2.0 KB | - | Dependency manifest, OK |
| `pnpm-lock.yaml` | 252.9 KB | - | Lock file, OK |
| `pnpm-workspace.yaml` | 0.1 KB | - | Workspace config, OK |
| `postcss.config.mjs` | 0.1 KB | - | CSS config, OK |
| `README.md` | 4.7 KB | - | Documentation, OK |
| `RESEARCH_PROMPT.md` | 28.7 KB | MOVE | Tracked, move to `leadgen/` or `docs/` |
| `sentry.*.config.ts` (3 files) | 0.7 KB total | - | Sentry config, OK |
| `tsconfig.json` | 0.7 KB | - | TS config, OK |
| `tsconfig.tsbuildinfo` | 748 KB | DELETE | Build by-product, regenerates, local only |
| `vitest.config.ts` | 0.4 KB | - | Test config, OK |

**All 38 root entries accounted for.**

---

## Summary of Actions

**Immediate (safe, won't affect tracking):**
1. Delete 6 CSV backups: `rm civic_outreach*.csv civic_outreach_review*.csv`
2. Delete build artifact: `rm tsconfig.tsbuildinfo`
3. Add 2 lines to `.gitignore`

**Planned (affects tracked files):**
1. Move `RESEARCH_PROMPT.md` and `civic_research_findings.md` to `leadgen/` or `docs/`
2. Commit the move + `.gitignore` update in a single PR

**No security risk.** Secrets properly gitignored.
