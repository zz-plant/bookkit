# Priority roadmap — Agent resources, new features, and enhancements

Date: 2026-02-12

## Scope traversed

- Governance and architecture docs (`README.md`, `AGENTS.md`)
- Existing MCP/skills research (`docs/mcp-agent-skills-research.md`)
- Current app and engine feature inventories (`apps/bad-people/specs/current-feature-specs-bad-people.md`, `packages/astro-bookkit/specs/current-feature-specs-bookkit.md`)
- UX audits and TODO state (`docs/audit-findings-consolidated.md`, `apps/bad-people/TODOS.md`)

## What the resource scan says

1. Core book/app capabilities are broadly implemented, including search, exports, analytics, feedback, releases, preview controls, localization, and AI-assisted local Q&A.
2. The largest remaining gaps are **agent enablement gaps**, not core feature gaps:
   - MCP has resources + read path, but tool surface is still minimal.
   - No repository-native lane skills for consistent AI contribution behavior.
   - UX audits repeatedly identify IA/navigation friction for first-time readers.

## Priority recommendations

## P0 — Safe, high-leverage agent foundation (do first)

### 1) Expand MCP resources to include governance + operational docs

**Why now**
- Agents repeatedly need architecture invariants, lane workflows, and command catalog.
- These docs exist but are not first-class machine-addressable MCP resources.

**Implementation target (engine-level)**
- Extend `packages/astro-bookkit/src/mcp/endpoint.ts` resource listing to include canonical governance documents and command references.
- Keep this read-only.

**Success metric**
- Agents can retrieve architecture/workflow constraints through MCP without repository-wide scanning.

### 2) Add deterministic read-mostly MCP tools

**Why now**
- Research already recommends narrow, auditable tools over broad autonomy.
- Existing scripts provide a natural backend for safe tool wrappers.

**Initial tool shortlist**
- `bookkit.list_books`
- `bookkit.validate_book(book)`
- `bookkit.check_separation()`
- `bookkit.list_mechanisms(book)`

**Success metric**
- Reduced agent retries and lower architecture-boundary violations in PR review.

### 3) Add repository-native lane skills for common contribution workflows

**Why now**
- Skills are available in the runtime, but this repo has no local skills encoding Bookkit-specific lanes.
- The architecture explicitly depends on strong separation between engine/config/content.

**Initial skills**
- Content edit lane
- Engine/schema/validator lane
- Release lane

**Success metric**
- More consistent command usage and fewer skipped validation steps.

## P1 — Reader UX improvements with strongest repeated audit signal

### 4) Reduce first-run navigation overload

**Why now**
- Multiple audits agree that first-action clarity is the biggest UX friction point.
- This is high-impact, low-risk presentation work.

**Scope**
- Strong single “Start reading” emphasis.
- Progressive disclosure for utilities (version/language/advanced tools).
- Reader-first default surfaces.

**Success metric**
- New readers can pick a first reading path within 5 seconds on mobile and desktop.

### 5) Clarify route semantics around downloads/exports and diagnostics

**Why now**
- Label/route ambiguity (“Downloads” semantics) and mixed reader/author surfaces increase cognitive load.

**Scope**
- Dedicated exports/downloads surface.
- Move diagnostics behind explicit author context.

**Success metric**
- Lower pogo-sticking between routes and improved task completion for offline/export intent.

## P2 — Accuracy and governance quality upgrades

### 6) Add citation-ready chunking for MCP resources

**Why now**
- Better citation precision improves generated reports/PR quality.

**Scope**
- Optional section/range reads in MCP endpoint.
- Stable chunk identifiers for deterministic references.

### 7) Add section-level change detection for trustworthy “updated” labels

**Why now**
- UX audits flagged recency labels as potentially misleading when based on coarse metadata.

**Scope**
- Compute per-section diff metadata from release artifacts.
- Drive “updated only” filters from objective change data.

## Suggested sequencing

1. P0.1 governance resources
2. P0.2 safe MCP tools
3. P0.3 lane skills
4. P1.4 first-run navigation clarity
5. P1.5 route responsibility cleanup
6. P2.6 citation chunking
7. P2.7 section-level change detection

## Risk notes

- P0 and P2 engine changes should preserve actionable validation errors and avoid book-specific exceptions.
- P1 is mostly app/layout UX and should not require schema/frame/compiler changes.

