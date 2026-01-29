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

---

## Drafts are allowed

You can mark content as draft to reduce strictness during collaboration.

Drafts:

- compile in warn mode
- do not ship in release mode
- make work visible without weakening the system

---

## What not to do

- Don’t add conditional logic inside content files
- Don’t weaken validation to “get unstuck”
- Don’t rename mechanisms casually
- Don’t optimize for vibes at the cost of clarity

The system exists to protect future readers — and future contributors.

---

## Getting help

If you’re unsure:

- open a PR and say “this is exploratory”
- leave a TODO in the content
- ask whether something should be a mechanism or an example

We’d rather help shape a contribution than reject it.
