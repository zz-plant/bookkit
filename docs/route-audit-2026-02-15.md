# Route audit: three typical user journeys

Date: 2026-02-15  
Book: `bad-people`  
Method: manual browser traversal of 3 core reader routes.

> Open issues tracked in tech-debt register: [TD-003](./tech-debt-register.md#td-003).

## Route 1 — Home (`/`)

### What can be removed
- Decorative empty icon links/buttons in the top nav that render as blank interactive elements (visible as empty items between "Start reading" and "Reading hub"). They create noise for keyboard and screen-reader navigation without adding intent.

### What needs to be rebuilt
- Primary decision architecture above the fold. The page currently mixes brand signal ("Bad People"), destination signal ("Reading hub"), and action cards in one dense cluster. Rebuild this as a clear 2-step flow:
  1. "Start reading" (default path),
  2. "Choose a route" (orientation / diagnosis / action).

### What needs modification
- Tighten hero copy hierarchy. Keep one leading message and reduce competing labels so users can scan the first screen in 3 seconds.
- Add stronger contrast between navigational cards and explanatory prose blocks to improve glanceability.

## Route 2 — Reading hub (`/read`)

### What can be removed
- Redundant framing copy that repeats route intent in multiple cards (e.g., orientation/problem-solving text duplications).
- At least one low-priority CTA in the footer action cluster ("See what changed", "Download", "Open diagnostics") should be demoted from equal visual priority.

### What needs to be rebuilt
- Entry-point grouping. Rebuild the hub into explicit buckets:
  - **Start here** (overview + first chapter),
  - **Solve now** (mechanisms + toolkit),
  - **Reference** (glossary + examples),
  - **Meta** (versions, downloads, diagnostics).
- Mobile-first card structure. Current card text density is high; rebuild cards with shorter title/subtitle pairs and move detail metadata to secondary rows.

### What needs modification
- Normalize label language across cards ("Need orientation", "Recommended start", "Foundations") to one consistent intent grammar.
- Keep keyboard shortcuts but visually separate them from primary content so they read as accelerators, not core meaning.

## Route 3 — Chapter detail (`/read/chapters/overview`)

### What can be removed
- Extra section headers that function as metadata labels rather than reader progression (for example, adjacent utility headings near core content) should be collapsed into a compact chapter meta panel.

### What needs to be rebuilt
- In-chapter progress scaffolding. Rebuild the chapter page with a persistent mini-TOC and "you are here" state that follows required frame steps (Purpose → Recognition → Mechanism → Agency → Next steps).
- End-of-chapter continuation logic. Replace generic next-step placement with explicit branch options (read next chapter, jump to mechanism, run toolkit action).

### What needs modification
- Clarify distinction between conceptual frame sections and operational sections (e.g., integrations/placement) by introducing visual section types.
- Improve download affordance placement so it does not compete with the chapter heading hierarchy.

## Cross-route priorities

1. **Remove interaction noise**: blank/duplicate controls and redundant copy.
2. **Rebuild flow architecture**: route selection should be explicit and progressive.
3. **Modify content density**: shorter card copy, clearer headings, and stronger visual grouping.

## Suggested implementation order

1. Clean navigation semantics and remove empty controls.
2. Rework `/read` information architecture (highest leverage).
3. Upgrade chapter scaffolding with TOC + branching exits.
4. Polish home hero hierarchy and CTA strategy.
