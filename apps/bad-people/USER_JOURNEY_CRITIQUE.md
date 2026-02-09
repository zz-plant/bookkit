# User Journey Critique (Bad People book app)

This review walks through three typical reader journeys and offers constructive, implementation-ready suggestions.

## 1) New reader discovery: Home → Reading hub → Chapters

### What works well
- The home page gives a clear “Start reading” call to action and a concise map of major reading surfaces. (`/`, then `/read`) 
- The reading hub uses consistent cards, item counts, and keyboard-shortcut hints, which lowers navigation friction for repeat visitors.
- The chapter index reuses a clean list pattern and adds export options in context (PDF/EPUB), which is good for readers who prefer offline reading.

### Friction observed
- The home page and reading hub both present several entry points at once, but there is no opinionated “recommended first path” for first-time readers.
- Chapter status is shown as small eyebrow metadata (“draft”), but the UX does not explain what draft status means for reliability.
- Export actions appear on chapter index pages but are not previewed earlier, so users may discover offline options late.

### Suggested improvements
1. Add a “Start with this chapter” primary CTA on `/read` that deep-links to the first foundational chapter (or a curated start module).
2. Add a compact “What draft means” inline help tooltip near status labels to set expectations.
3. Surface export affordances once on the reading hub with a short explanation (“Prefer offline? Download PDF/EPUB”).

---

## 2) Concept understanding: Reading hub → Mechanism detail → Related actions/examples

### What works well
- Mechanism detail pages are structurally strong: definition, recognition cues, tests, and then related toolkit/examples.
- “Next steps” and “Keep going” links support continuation instead of dead-ending on a single concept page.
- Breadcrumb + back link provides two orientation methods, which helps users who enter from deep links.

### Friction observed
- Mechanism index pages rely on list scanning and may not quickly communicate “difficulty,” “importance,” or “where to start.”
- The detail page can become long when multiple sections are present, but there is no in-page table of contents/jump links.
- Related items are useful but not ranked, so novice users may not know which action/example is the best first move.

### Suggested improvements
1. Add optional mechanism index metadata chips (e.g., “core,” “advanced,” “high leverage”) for scanability.
2. Add a generated in-page mini TOC (Definition / Recognize / Quick tests / Next steps) at top of mechanism pages.
3. Rank related toolkit actions with a simple heuristic such as shortest timebox first, then show others as alternatives.

---

## 3) Returning reader updates: Home/Read → Release notes → Version awareness

### What works well
- Release notes are first-class (dedicated page + RSS), which is excellent for return engagement.
- Version data is included alongside releases, making change tracking possible without leaving the app.
- A clear release-notes card on the home page gives users a non-reading path when they just want “what changed.”

### Friction observed
- The path to “what’s new since my last visit” depends on user memory; no explicit filtering or highlight state is visible from entry pages.
- There is no obvious “changes impacting readers” summary view separate from full note detail.
- The reading hub does not appear to show a lightweight “latest update” banner, so update visibility is separated from reading flow.

### Suggested improvements
1. Add a “Since last visit” affordance (cookie/localStorage-backed) on release notes and optionally the reading hub.
2. Add a short “Reader-impact summary” block at the top of each release entry.
3. Show a subtle “Updated in vX.Y” pill on relevant reading hub cards when a section changed recently.

---

## Prioritization (quick wins first)

1. **High impact / low effort:** Add a single recommended starting path on `/read`.
2. **High impact / medium effort:** Add “Since last visit” release filtering/highlighting.
3. **Medium impact / low effort:** Explain draft status meaning where status is displayed.
4. **Medium impact / medium effort:** Add mechanism-page mini TOC and rank related actions.

## Review method

- Journey review performed by traversing route/page implementations and shared rendering components for home, read hub, chapters, mechanisms, and release notes.
- Runtime browser traversal was attempted, but local dev server failed in this environment due to an Astro middleware module resolution issue (`Cannot find module 'astro:middleware'`).
