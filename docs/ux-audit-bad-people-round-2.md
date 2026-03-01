# UX Audit (Round 2) — `apps/bad-people`

Date: 2026-02-11  
Scope: Reader-facing flows (`/`, `/read`, global navigation in shared `BookLayout`).  
Method: Heuristic review of information hierarchy, interaction cost, progressive disclosure, and trust signaling.

> Open issues tracked in tech-debt register: [TD-003](./tech-debt-register.md#td-003).

## Executive summary

The current UX is noticeably calmer than the prior iteration: duplicate update CTAs were removed, advanced controls are no longer pre-expanded, and the reading hub now has a clearer first action.

The next quality jump is to tighten **intent continuity** between homepage and reading hub, then streamline optional surfaces (release metadata, diagnostics, and keyboard hints) so readers only see complexity when it helps them complete a task.

---

## What got better (keep)

1. **Advanced nav controls are collapsed by default**
   - This substantially reduces first-glance cognitive load in the header.
2. **Duplicate release-notes pathway was removed**
   - Better IA clarity and less “which one do I click?” friction.
3. **`/read` now has a stronger hierarchy**
   - “Recommended start” → “Reading surfaces” is the right progression.
4. **Ambiguous blanket “updated” badges are gone**
   - This improves trust by avoiding weak recency claims.

---

## Kondo pass — remove / move / modify

## Remove

1. **Competing “start” narratives on the homepage**
   - The page still has multiple onboarding framings (“Start in 3 minutes”, “Book snapshot”, “Reading and updates”).
   - Keep one primary onboarding story and one secondary support block.

2. **Low-signal decorative keyboard hints on content cards**
   - Repeating shortcut chips inside many cards can feel like visual noise for mouse/touch readers.
   - Keep shortcuts discoverable in one place (header/tool panel/help modal), not everywhere.

## Move

1. **Move release summary context closer to release actions**
   - In `/read`, the “Latest update summary” appears after the section grid. That’s good for focus, but consider moving it fully into `/release-notes` as a pinned “What changed since last visit” module.

2. **Move author diagnostics to a dedicated route-level utility area**
   - Current “Publishing diagnostics (optional)” is better than before, but still sits on a core reader route.
   - Consider `/read/tools` (or equivalent) for non-reader utilities.

## Modify

1. **Tighten homepage intent continuity**
   - Suggested structure:
     - Block 1: “Start reading now” (single primary CTA + one alternate path)
     - Block 2: “Choose by need” (orientation/problem-solving/action)
     - Block 3: stats or metadata (optional)

2. **Reduce copy density in first viewport**
   - Shorten helper text by ~20–30% on `/` and `/read` cards; front-load verbs and outcomes.

3. **Clarify section-scanning behavior on `/read`**
   - Add one line above section cards such as: “Pick a section; each opens index + item pages.”
   - This sets expectation for what click-through provides.

4. **Improve mobile CTA prioritization**
   - Current mobile CTA includes Read/Search/Menu. Consider visually emphasizing one primary action (“Read”) and rendering others as secondary.

---

## Suggested quick wins (1–2 PRs)

### PR A — Clarity pass
- Consolidate homepage intro blocks into one primary onboarding strip + one secondary context strip.
- Trim card microcopy to outcome-first phrasing.
- Remove repetitive per-card shortcut chips where not essential.

### PR B — Route responsibility pass
- Move diagnostics to a dedicated route or tools page linked from `/read`.
- Keep `/read` fully reader-first.
- Keep release summary optional and scoped to release-focused navigation.

---

## Acceptance criteria for next iteration

- New reader can select a first reading path in <= 5 seconds on both desktop and mobile.
- Homepage has one obvious primary CTA and no competing “start” narratives.
- `/read` contains only reader-facing navigation by default.
- Optional/advanced utilities are discoverable but not visually dominant.

---

## Risk and migration notes

- Scope is presentation + route IA only; no schema/frame/compiler changes required.
- Low risk to core architecture invariants.
- Main regression risk is discoverability of moved tools; mitigate with explicit links and shortcut help.
