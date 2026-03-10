# User journey critique — Running Hot

This walkthrough evaluates three common reader journeys using the current app surfaces and implementation behavior.

## Journey 1 — New reader discovers where to start

### Typical path
1. Land on `/read`.
2. Scan section cards and "Recommended path" guidance.
3. Click into the suggested starting chapter.

### What works well
- The reading hub gives a clear top-level map (Overview/Chapters/Mechanisms/Toolkit/Glossary/Examples), reducing first-session ambiguity.
- The "Start here" block gives a concrete beginning instead of forcing choice paralysis.
- Shortcut hints (`g c`, `g m`, etc.) support power users without blocking novices.

### Constructive critique
- The page mixes reader and author intents by showing an "Analytics" card in the same primary grid. New readers may click into an author-only area that does not advance learning.
- The "Start here" copy assumes chapter-first is always best, but some readers arrive with a mechanism question and would benefit from alternate entry points.
- The latest release module competes with onboarding hierarchy; on first visit, "What changed" can distract from "What to read first."

### Suggested improvements
- Move analytics to a secondary "Author tools" area (or require explicit affordance) to reduce reader-path noise.
- Add two alternate quick-start choices ("Understand the frame" and "Solve a specific problem") alongside the current chapter-first suggestion.
- Collapse or de-emphasize release notes for first-time visitors, then expand once the reader has started the content.

---

## Journey 2 — Reader searches for a concept and validates understanding

### Typical path
1. Open search (`⌘K` or `/`) from any reading page.
2. Enter concept terms and inspect matching snippets.
3. Open result pages and optionally use "Ask the book" for synthesis.

### What works well
- Search and Q&A are embedded in shared layout, so discovery tools are always one action away.
- Empty/search-unavailable messaging is present, so failure states are not silent.
- Q&A explicitly states grounding constraints and shows cited passages, which sets trustworthy expectations.

### Constructive critique
- Search loads the index only after panel open, adding first-use latency exactly when intent is highest.
- Search and Q&A both rely on the same local index, but the UI does not make their relationship obvious; users may assume Q&A has broader external knowledge.
- The Q&A answer panel shows one synthesized answer first and citations after; for skeptical readers, evidence-first could improve confidence.

### Suggested improvements
- Warm the search index in idle time on first content page load to reduce perceived lag.
- Add a small "Uses local book index only" label near both search and Q&A inputs for expectation alignment.
- Offer a "show citations first" view mode in the Q&A panel for verification-heavy readers.

---

## Journey 3 — Reader moves from online reading to offline export

### Typical path
1. Navigate to `/read/chapters`.
2. Review chapter list and export panel.
3. Download full-book or per-chapter PDF/EPUB.

### What works well
- Export affordances are colocated with chapter browsing, matching the user moment where offline needs appear.
- Support for both full-book and chapter-level formats accommodates different commitment levels.
- The export panel description is clear and action-oriented.

### Constructive critique
- Export options are discoverable only from Chapters; readers in Mechanisms/Toolkit may not realize exports exist.
- No lightweight pre-download cues are shown (file size, last generated time, expected rendering differences), which can cause uncertainty.
- Export path feels transactional; there is no post-download guidance on best use (print workflow, annotation workflow, or when to use EPUB vs PDF).

### Suggested improvements
- Add a persistent "Downloads" link in global navigation and keep chapter-level panel as contextual reinforcement.
- Surface metadata for each export link (format purpose, rough size, freshness).
- Add a brief "Which format should I choose?" helper to reduce trial-and-error.

---

## Cross-journey recommendations (priority)

1. **Clarify audience context in navigation** (reader vs author tools) to reduce wrong-path clicks.
2. **Reduce first-interaction latency** in discovery flows (preload search index opportunistically).
3. **Strengthen trust cues** by making evidence visibility and grounding constraints more prominent.
4. **Improve export discoverability globally** so offline workflows are available from any reading context.
