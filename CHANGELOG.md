# Changelog

Dated, documented behavior changes to the Bookkit engine, schemas, validators, and scripts.
Per-book editorial history lives in each app's `src/content/book/releases/`.

## 2026-09-07 — Architecture documentation becomes a gate

**Highlights**
- New canonical document `docs/architecture.md`: three-layer model, the two pipelines (Astro render vs. Bun governance CLI), the full engine module map with import tiers, the content-section contract, and extension points. Replaces the stale repo-layout tree in `README.md`, which listed 9 of the engine's 26 modules.
- New gate `bun run check:architecture` (`scripts/check-architecture.ts`, `--json` supported), added to CI. It verifies the document against the tree: every engine module is mapped and every mapped module exists; imports point strictly down a tier; the declared import cycles are exactly the cycles that exist; and workspace paths and content sections match disk. Machine-checked regions are delimited by `<!-- architecture:*:start -->` markers.
- **New invariant, now enforced**: engine modules are tiered, and a module may only import from a strictly lower tier. Same-tier imports are legal only inside a declared cycle. Two cycles are declared and tolerated — `frames` ↔ `validators` and `book` ↔ `components` ↔ `layouts`; any new cycle fails CI.
- `packages/astro-bookkit/src/README.md` reduced to a pointer; it had drifted to 6 modules and described the empty `compiler/` directory as owning compile/ordering/export logic that actually lives in `book/` and `exports/`.

**Scope**: documentation + one new CI gate. No engine, schema, frame, or validator behavior changes. Known warning: `packages/astro-bookkit/src/compiler/` is an empty placeholder the gate reports on every run until it is removed or implemented.

## 2026-09-07 — Proposal pipeline (`bookkit propose`)

**Highlights**
- New engine module `packages/astro-bookkit/src/proposals/`: composes a reviewable **proposal bundle** from a book's current content — frame detection (runbook vs intervention from keyword signals), mechanism drafts for unregistered recurring concepts, missing prerequisite edges, toolkit bindings for uncovered/proposed mechanisms, and a `book.config.ts` draft.
- New CLI `bun run bookkit propose <book>`: prints the bundle, writes artifacts with `--write` to `apps/<book>/proposals/`, and materializes approved proposals with `--apply mechanisms --apply tools --apply config`. Materialization refuses to overwrite or redefine registered slugs; the live `book.config.ts` stays author-gated. `--detect-frame` evaluates content independent of the declared frame; `--id <proposal>` accepts a specific proposal.
- Shared book-content loader extracted to `scripts/lib/load-book.ts`; `check:suggestions` now consumes it (behavior unchanged).

**Scope**: new engine capability + CLI. No schema, frame, or validator changes — existing books unaffected.

## 2026-09-05 — create-bookkit generator, compliance artifact, frontmatter fidelity

**Highlights**
- New `packages/create-bookkit/` generator (`bun run create-bookkit <dir> --book <slug>`): scaffolds a standalone book project with the engine vendored inline (works offline, no publish required). App surface, config, and checker scripts (`validate`, `suggest`, `runbooks`, `import`) are wired and verified end-to-end against an installed, built, and validated project.
- `bun run check:runbooks --export <file.json>` writes the compliance matrix as a machine-readable artifact (book, generatedAt, covered/total, rows).
- Engine fix in `parseSimpleFrontmatter` (`validateBookInMemory` / MCP `validate_book`): YAML list frontmatter (`is:`, `steps:`, …) is now parsed as arrays and numeric scalars as numbers, so the deterministic verify tool no longer flags valid list-bearing content as schema-invalid. New test coverage in `validators/book-validator.test.ts`.

## 2026-09-04 — Runbook wedge (engine + schemas + proof book)

**Highlights**
- New `runbook` frame: required steps `ownership`, `trigger`, `steps`, `escalation`, `verification`.
- Frame enforcement is now config-driven: the overview chapter is validated against the frame declared in `book.config.ts` (`extractFrameConfigFromSource`), falling back to the intervention frame when none is declared. Runbook books are no longer checked against the intervention frame.

**Backward-compatible schema extensions (all optional with defaults)**
- `toolkitSchema`: `owner`, `reviewEveryDays`, `drills`, `escalation {to, when, withinHours?}`, `satisfies`, `runbookSteps [{when?, action}]`.
- `mechanismSchema`: `satisfies`.
- Existing books are unaffected.

**New surfaces**
- `packages/astro-bookkit/src/suggestions/runbook-coverage.ts`: `auditRunbookCoverage`, `deriveComplianceMatrix`, `summarizeCompliance`, `auditReleaseControlDrift`.
- `scripts/check-runbooks.ts` (`bun run check:runbooks`): audits runbook coverage, derives the compliance matrix, and joins release narratives against HEAD coverage.
- Proof book `apps/on-call/`: 4 control mechanisms, 4 drilled toolkit primitives, runbook-framed chapters, examples, glossary, release.

**Docs**
- `docs/design-notes.md` (invariant rationale), `docs/sop-wedge-gap-analysis.md` (plan + status), README migration notes.

## Prior work (summarized)

- **AI suggestion layer**: deterministic analyzers for mechanism overlap, concept triage (+ candidate mechanism drafts), example-swap auditing, prerequisite edges, and reading-order QA grounding. Ships as `bun run check:suggestions`.
- **MCP tooling**: `bookkit.*` MCP tools incl. `validate_book`, `list_books`, `export_book`, `compile_book`.
- **Recompilable-books core**: engine/author/content separation, Zod schemas, frame validators, graph-based ordering, PDF/EPUB exports, shim enforcement.