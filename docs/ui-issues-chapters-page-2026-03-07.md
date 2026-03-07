# UI Issues — Chapters Page (Screenshot Review, 2026-03-07)

## Scope
Observed issues from the provided `/read/chapters` desktop screenshot for the draft book instance.

## Identified issues

1. **Duplicated utility chips create ambiguity**
   - Two stacked rows repeat the same actions (`Release notes`, `Downloads`), creating a perception of accidental duplication rather than intentional grouping.
   - Risk: lowers trust and increases decision friction at the top of the page.

2. **Top navigation and local utility actions compete for attention**
   - Global header actions (`Reading hub`, `Downloads`) and local page utility chips sit close together with similar visual weight.
   - Risk: unclear interaction hierarchy and slower first action selection.

3. **Search affordance is visually underspecified**
   - The top-right search appears as plain text (`Search ⌘K`) instead of a clear control/button/input trigger.
   - Risk: reduced discoverability, especially for new users.

4. **Primary page intent is delayed by pre-content controls**
   - Several control rows appear before the main `Chapters` heading context is fully established.
   - Risk: users encounter tool chrome before understanding the page purpose.

5. **Filter and jump controls are fragmented**
   - “Filter list”, alphabet jump row, and “Jump to download exports” are separated and visually inconsistent.
   - Risk: interaction model feels piecemeal; users must re-parse control patterns.

6. **Alphabet jump row has low scan clarity**
   - Single-letter links have minimal spacing/contrast and are easy to miss.
   - Risk: weak affordance for long-list navigation.

7. **Draft status dominates every card through repetition**
   - Every chapter card repeats a `draft` label and `guided path` chip in the same position.
   - Risk: repetitive metadata noise pushes titles (the key scanning target) lower in salience.

8. **List density is high for desktop reading**
   - Long uninterrupted stacks of similarly styled cards create visual monotony.
   - Risk: navigation fatigue and reduced wayfinding accuracy.

9. **Section grouping is too subtle**
   - Letter-group headings (`D`, `T`, `H`, etc.) are present but visually weak relative to card boundaries.
   - Risk: users do not effectively leverage grouping anchors while scrolling.

10. **Download exports section appears disconnected from earlier jump link**
    - The section is only visible at the bottom, and the anchor relationship from the earlier jump link is not strongly reinforced.
    - Risk: “jump” behavior may feel abrupt and users can lose context.

11. **Footer state message is too quiet for draft context**
    - `Draft book instance.` appears in a low-emphasis footer location.
    - Risk: environment status may be missed by users who need explicit draft/production clarity.

## Severity triage

- **High**
  - Duplicate utility chips at top.
  - Weak hierarchy between global and local actions.
- **Medium**
  - Fragmented control cluster (filter/jump/export).
  - Low-clarity alphabet jump row.
  - High list monotony and weak group anchors.
- **Low**
  - Footer draft-state emphasis.

## Recommended first fixes

1. Consolidate duplicate top utility chips into one canonical action row.
2. Establish stronger hierarchy: global nav subdued, page-level actions grouped.
3. Merge filter + jump controls into a single “list tools” block with consistent affordances.
4. Increase visual prominence of letter-group anchors and reduce repeated metadata noise on cards.
