# Contributing to Bookkit

You do not need full-system context to contribute safely. Pick a lane, run checks, and keep architecture boundaries intact.

For architecture + commands see [`README.md`](./README.md). For hard invariants see [`AGENTS.md`](./AGENTS.md).

---

## Fast-start workflow

1. Install dependencies: `bun install`
2. Make a focused change.
3. Run checks:
   - `bun run validate`
   - `bun run lint`
   - `bun run check:types`
4. For release-critical work, also run:
   - `bun run validate:release`
   - `bun run check:upgrade -- --release`

### Pre-flight: classify the change before coding

Use this sequence to reduce rework:

1. **Pick risk level** (low / medium / high).
2. **Choose lane** (A/B/C below).
3. **Decide test depth** using the matrix in [Verification matrix](#verification-matrix).
4. **Write one-line intent note** (helps reviewers validate scope quickly).

---

## Choose a contribution lane

## Lane A — Content improvements (low risk)

Examples:

- chapter edits
- case/example additions
- glossary polish
- copy/style improvements

Typical paths:

- `apps/<book>/src/content/book/chapters/**`
- `apps/<book>/src/content/book/examples/**`
- `apps/<book>/src/content/book/glossary/**`

Rules:

- Do not introduce floating named concepts.
- Do not redefine mechanisms from prose.
- Keep examples replaceable.

## Lane B — Mechanisms and tools (medium risk)

Examples:

- adding a mechanism
- adding an action primitive/tool
- clarifying mechanism boundaries

Typical paths:

- `apps/<book>/src/content/book/mechanisms/**`
- `apps/<book>/src/content/book/toolkit/**`

Mechanism quality bar:

- stable slug identifier
- one-sentence definition
- explicit boundaries (`is` / `is not`)
- 1–3 testable predictions

Tool quality bar:

- explicit trigger
- executable steps (≤10 minutes)
- clear failure mode
- legitimate demand unlocked

If meaning changes for an existing mechanism, treat it as breaking and document migration guidance.

## Lane C — Engine / schema / frame changes (high risk)

Examples:

- frame requirement changes
- schema shape changes
- validation strictness updates
- compiler ordering logic

Typical paths:

- `packages/astro-bookkit/src/frames/**`
- `packages/astro-bookkit/src/schemas/**`
- `packages/astro-bookkit/src/validators/**`
- `packages/astro-bookkit/src/compiler/**`

Requirements:

- stay book-agnostic
- keep validation errors actionable
- include rationale in comments or PR notes
- include before/after behavior in commit/PR description

---

## Verification matrix

Run the smallest complete check set for your lane.

| Lane | Minimum checks | Escalate to |
| --- | --- | --- |
| A (content) | `bun run validate`, `bun run lint` | `bun run validate:release` when editing mechanism-adjacent prose |
| B (mechanisms/tools) | `bun run validate`, `bun run lint`, `bun run check:types` | `bun run validate:release` when changing definitions/boundaries |
| C (engine/schema/frame) | `bun run validate`, `bun run validate:release`, `bun run lint`, `bun run check:types` | `bun run check:upgrade -- --release` for behavior-affecting changes |

If checks fail due to intended strictness changes, update error text so it stays actionable.

---

## Validation modes

- `bun run validate` → warn mode for active drafting.
- `bun run validate:release` → error mode for release gates.

If validation fails, fix the structure; do not weaken rules just to pass.

Common fixes:

- missing action primitive → add executable ≤10-minute tool step
- missing frame step → add required structural section
- unregistered concept → register as mechanism or glossary term

---

## New book scaffold checklist

After running `bun run new:book -- --book <slug> --title "..."`:

- update `src/book.config.ts`
- replace starter files in `chapters/`, `mechanisms/`, `toolkit/`, `examples/`, `glossary/`, `releases/`
- run `bun run validate` and `bun run validate:release`
- verify `bun run dev:<book>` and `bun run build:<book>` (or equivalent filter commands)

---

## Submission expectations

- Keep PRs scoped and reviewable.
- Explain intent and risk level (low/medium/high).
- For risky changes, include a short before/after summary.
- If you change schemas/validation, include migration notes when needed.

### Recommended PR description structure

Use a concise structure to improve review speed:

1. **What changed** (2–5 bullets)
2. **Why now** (problem being solved)
3. **Risk level** (low/medium/high)
4. **Before/after behavior** (required for medium/high)
5. **Validation run** (exact commands)
6. **Migration notes** (only when schema/validator behavior changes)

---

## Documentation governance

- `README.md` = architecture and operations
- `CONTRIBUTING.md` = workflow and lane selection
- `AGENTS.md` = invariants and guardrails

Link to canonical sections instead of duplicating long policy text.
