# New user route critique (browser walkthrough)

This note captures a constructive UX review of two likely first-time routes through the app:

1. **Route A:** `/` → `/read`
2. **Route B:** `/read` → `/read/overview` and `/read/mechanisms`

## Route A (`/` → `/read`)

### What can be removed

- **Astro ecosystem footer links** (`Report a Bug`, `Feedback`, `Documentation`, `Community`) from the primary reading shell for book readers. They are framework-level links that compete with book-specific calls to action and add decision noise at first contact.
- **Duplicate “Start reading” entry points** can be reduced. The current home route includes multiple links that all lead to `/read` (top nav CTA, route card CTA, and book card CTA), which increases visual clutter without adding new user value.

### What should be rebuilt

- **Home information hierarchy should be rebuilt around one dominant beginner intent.** The page currently presents multiple navigation layers at once (book picker, route cards, release links, and integration/promotional blocks), making the first decision ambiguous.
- Rebuild the hero section as a simple decision fork:
  - “I’m new, guide me” → `/read/overview`
  - “I have a problem, help me now” → `/read/mechanisms`

### What needs modification

- **Label clarity:** replace generic CTA copy like “Start reading” with intent-specific language (e.g., “Start with overview (3 min)” or “Find a mechanism”).
- **Progressive disclosure:** demote release/offline/diagnostic links to a secondary utility area so the first fold is focused on onboarding.
- **Book switch affordance:** the “Other book” external link is useful, but should be visually separated from the primary current-book action path to avoid accidental context switching.

## Route B (`/read` → `/read/overview` and `/read/mechanisms`)

### What can be removed

- **Developer overlay artifacts from default reading views** (e.g., “No islands detected”, “Audit”, “Settings”) should be removed/disabled for user-facing sessions. They read like debugging UI and dilute trust for new readers.
- **Featured integrations block in core reading routes** can be removed or moved behind a “More” disclosure. It appears repeatedly and is not part of a new reader’s core task flow.

### What should be rebuilt

- **Reading hub bucket model (“Start here / Solve now / Reference”) should be rebuilt as a guided path with state.** Right now it is a static jump menu; first-time users need a visible sequence and completion cues.
- **Mechanisms list should be rebuilt for scannability.** Current cards are dense text blocks; a stronger list design would foreground:
  - mechanism name,
  - one-sentence trigger (“Use this when…”),
  - a single “Open action” next step.

### What needs modification

- **Overview page:** add estimated reading time and explicit “Next step” CTA at the end of each major section so users do not stall after orientation.
- **Mechanisms index:** add filters/tags (e.g., urgency, leverage, reversibility) to help a new user pick quickly under pressure.
- **Cross-route continuity:** maintain a persistent “You are here” indicator and recommended next click from `/read` into `/read/overview` and `/read/mechanisms`.

## Priority order (suggested)

1. **P0:** Remove developer/debug surface from reader routes.
2. **P1:** Simplify first-fold navigation and deduplicate home CTAs.
3. **P1:** Add guided-path state and explicit next-step CTAs in `/read` and `/read/overview`.
4. **P2:** Improve mechanism list scannability and filtering.
