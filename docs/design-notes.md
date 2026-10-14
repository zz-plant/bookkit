# Design Notes — why the invariants exist

This is the reasoning layer. `AGENTS.md` is the law; this document is the case law. If you are changing a schema, frame, validator, or compiler behavior, read the relevant invariant here first.

## The core claim

A book is a **specification that compiles**, not a pile of loosely-coupled prose. Content without structure cannot be verified, diffed, gated, or recompiled — the same way source that does not typecheck cannot be shipped. Every invariant below exists to keep that claim true.

## Invariant 1 — Mechanism identity is stable

Slugs are durable identifiers. Chapter text references a mechanism by slug; tools bind to a mechanism by slug; glossary entries list mechanisms by slug; the prerequisite graph is built on slugs.

**Why:** identity is the load-bearing surface. Everything else (prose, examples, even `is`/`isNot` boundaries) is replaceable. If a slug meant one thing in release 1 and another in release 2, every downstream consumer silently changes meaning. Redefinition is therefore a breaking change, and the change surface is traceable through one file: the mechanism's own frontmatter.

## Invariant 2 — Frames are enforceable

A frame (intervention, field-guide, runbook) declares required sections. Enforcement is **structural**: the overview chapter must contain the required headings, and the validator checks the heading list against the frame declared in `book.config.ts`.

**Why:** implied prose is slippery. "The author shall convey ownershift" is not checkable; "the `ownership` heading must exist in `00-overview.mdx`" is. When the runbook frame claims a step is required, a machine can prove the step exists on first read. Frames turned "is this well-framed?" into a boolean.

## Invariant 3 — Examples are replaceable

Changing an example must not change the mechanism's function. The optimizer flags examples that restate a mechanism's signature terms instead of illustrating the mechanism in a fresh domain.

**Why:** examples carry current events. If a mechanism's *meaning* depends on which example is attached, then the mechanism becomes hostage to the news cycle and to whichever example happened to be written first. Keeping examples swappable means the mechanism is defined by its boundaries and predictions, not by any single story.

## Invariant 4 — Ordering is graph-based

Read order is derived from declared `prerequisites` and mechanism references; there is no single canonical sequence inside the schema. The suggestion layer proposes missing prerequisite edges and the compiler surfaces them.

**Why:** a book with one enforced order forces a linear reading on every reader. Graph-based ordering lets a book express dependency arcs (runbook → activation, prerequisite mechanisms → dependent chapters) without encoding a single path. It also makes "is this chapter reachable and correctly sequenced" machine-checkable.

## Invariant 5 — Action primitives are executable

Toolkit primitives must be ≤10 minutes, failure-resilient, and non-heroic — and `timeboxMinutes` is clamped at 10 in the schema.

**Why:** a tool that asks for an hour of willpower is a wish, not a procedure. The 10-minute budget is what keeps toolkit content operational rather than aspirational, and it is what makes drill coverage meaningful: if the procedure runs in 10 minutes, a team can actually rehearse it.

## AI governance — "AI may propose; the compiler decides"

The suggestion layer (`packages/astro-bookkit/src/suggestions/`) is deterministic: it proposes candidate mechanisms, prerequisite edges, example swaps, and runbook coverage findings. **Nothing AI-generated may bypass a validator** — a proposed mechanism is a draft until a human author records it and triggers recompilation.

**Why this ordering:** putting AI in the propose-position keeps a human + determinism in the decide-position, so the compiler's guarantees do not depend on the model being right.

## Error philosophy

Errors are `NormalizedErrorPayload`s with five parts: `machineCode`, `humanSummary`, `location`, `failingRule`, `nextAction`. The `nextAction` is mandatory. Each payload also carries a `severity` (`error` or `warning`) and a `gateLevel` (`blocking` or `advisory`), and MCP tool failures use the same shape.

**Why:** "validation failed" is torture. "Frame runbook is missing required step ownership; add the Ownership heading to chapters/00-overview.mdx before validating again" is a reviewable instruction. Everything else is decoration.

## The runbook frame (2026-09-04)

The runbook frame + runbook schema fields (owner, reviewEveryDays, drills, escalation, satisfies, runbookSteps) extend the same five invariants to operating procedures. `satisfies` is machine-checkable coverage but **not evidence**; `drills` are the evidence. The compliance matrix is therefore "coverage," never "certification," and the drill-coverage analyzer is a governance gate, not a compliance stamp.

Boundaries kept:
- One `runbook` frame in the engine registry — never a per-team frame.
- Runbook fields are optional with defaults; teaching books are untouched.
- Release-diff checks are computable at HEAD; they never reconstruct past state.

## Changelog

See [`CHANGELOG.md`](../CHANGELOG.md) for dated, documented behavior changes.