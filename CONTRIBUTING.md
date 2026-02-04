# Contributing to Bookkit

You do **not** need to understand the full architecture to contribute.

This repo is designed to support different contribution styles — including vibe-coding — without breaking the book.

Choose the lane that matches what you want to do.

---

## Choose your lane

### Lane A — Add prose, examples, or cases (lowest friction)

Good if you want to:

- add an example
- tell a story
- contribute a case study
- add a citation or reference

Where to work:

- `apps/<book>/src/content/book/examples/`
- `apps/<book>/src/content/book/chapters/`
- `apps/<book>/src/content/book/cases/`

Rules:

- Do **not** invent new named concepts
- Do **not** change mechanism definitions
- Assume examples are replaceable

If validation fails, it should tell you exactly what to fix.

---

### Lane B — Propose a new mechanism or tool (guided)

Good if you’re naming a pattern or adding an action.

Before you start:

- Ask: “Is this actually new, or an example of an existing mechanism?”

How to do it:

- Add a new file under `mechanisms/` **or**
- Add a new file under `toolkit/`

Mechanisms must include:

- a stable slug
- a one-sentence definition
- clear boundaries (is / is not)
- 1–3 predictions readers can test

Tools must include:

- a trigger condition
- steps (≤10 minutes)
- what failure looks like
- the legitimate demand it unlocks

Validation will guide you if something is missing.

**If you need to change an existing mechanism:**

- Treat it as a breaking change.
- Add a short “mechanism change note” in your PR summary or commit message
  (what changed, why it’s still the same mechanism, and migration advice if any).
- If the meaning shifts, create a new mechanism instead of redefining.

---

### Lane C — Engine / frame work (restricted)

Good if you’re:

- changing schemas
- modifying validation
- adding or changing frames

Rules:

- Changes must be book-agnostic
- Include rationale in code comments
- Expect review and iteration

If you’re not sure you’re in this lane, you probably aren’t.

---

## How validation works (and how to read it)

Validation errors are not judgments. They mean:

> “The compiler can’t guarantee the book still works.”

Typical fixes:

- register a concept instead of floating it in prose
- add a missing action primitive
- fill a required frame step
- mark something as `draft: true`

If an error message is unclear, that’s a bug — please flag it.

### Validation expectations (decision guide)

Use this as a quick decision tree for running validation:

1. **Drafting or collaboration?**  
   Run `bun run validate` (warn mode). Fix what you can; mark drafts as `draft: true`
   to keep work visible while iterating.
2. **Pre-release or merging?**  
   Run `bun run validate:release` (error mode). All errors must be resolved before
   release.
3. **Changed schemas, validation rules, or frames?**  
   Ensure any new errors have actionable guidance, and document breaking changes
   (README or commit message).

Common failure patterns and fixes:

- **Missing action primitive** → add a ≤10 minute, failure-resilient step.
- **Unregistered concept** → register a mechanism or glossary term.
- **Missing frame step** → add a required section (don’t imply it in prose).

### Upgrade safety net (full repo checks)

When upgrading dependencies or compiler logic, run the full safety net:

- `bun run check:upgrade` (warn-mode validation)
- `bun run check:upgrade -- --release` (error-mode validation)

This bundles linting, TypeScript type checks across `apps/*` and `packages/*`,
book validation, and the architectural checks for separation and floating concepts.

---

## Drafts are allowed

You can mark content as draft to reduce strictness during collaboration.

Drafts:

- compile in warn mode
- do not ship in release mode
- make work visible without weakening the system

---

## TypeScript config hierarchy

This repo uses a shared base config with per-package overrides:

- **Root base**: `tsconfig.base.json` defines modern defaults like `moduleResolution: "bundler"`, `strict: true`, and `resolveJsonModule`.
- **Astro app**: `apps/bad-people/tsconfig.json` extends the base and adds Astro-specific compiler options (including `types: ["astro/client"]` and Astro JSX settings).
- **Engine package**: `packages/astro-bookkit/tsconfig.json` extends the base and scopes TypeScript to `src/` and `specs/`.

If you add another app or package, extend the base config and only add framework-specific overrides where needed.

---

## Scaffold placeholder checklist (new books)

If you used `bun run new:book`, replace the starter placeholders before publish:

- `src/content/book/chapters/00-overview.mdx` → update the Purpose + Outline bullets.
- `src/content/book/mechanisms/starter-mechanism.mdx` → replace definition, boundaries, predictions, and tests.
- `src/content/book/toolkit/starter-mechanism--starter-tool.mdx` → replace trigger, steps, failure mode, and legitimate demand.
- `src/content/book/examples/starter-mechanism/starter-example.mdx` → replace the domain and the example narrative.
- `src/content/book/glossary/starter-term.mdx` → replace the term and definition.
- `src/content/book/releases/<date>-initial-draft.mdx` → replace the release note summary and highlights.

---

## What not to do

- Don’t add conditional logic inside content files
- Don’t weaken validation to “get unstuck”
- Don’t rename mechanisms casually
- Don’t optimize for vibes at the cost of clarity

The system exists to protect future readers — and future contributors.

---

## Example checklist (keep examples replaceable)

Before you submit an example or case:

- Does it illustrate an existing mechanism without redefining it?
- Could we swap this example without changing the module’s function?
- Does it avoid introducing new named concepts?
- Is any current event treated as context, not as a mechanism definition?

---

## Getting help

If you’re unsure:

- open a PR and say “this is exploratory”
- leave a TODO in the content
- ask whether something should be a mechanism or an example

We’d rather help shape a contribution than reject it.
