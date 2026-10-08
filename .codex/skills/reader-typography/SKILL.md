---
name: reader-typography
description: Use for any change to what readers see (engine styles, components, layouts, book-app pages). Holds Bookkit's typographic taste, the two-voice system, and the review checklist so UI work starts from decisions already made instead of from defaults.
---

# reader-typography

## When to use

Use for changes to:

- `packages/astro-bookkit/src/styles/**`
- `packages/astro-bookkit/src/components/**` and `src/layouts/**`
- `apps/<book>/src/pages/**` markup

Before starting, name the bet the change serves (`docs/bets.md`). Reader-facing polish is parked unless a bet's test needs readers to get through a book.

## Where the taste comes from

The reference point is the type-design corner of the internet: people who make typefaces, or who set their own pages, and who argue in public about defaults. Learn from what they ship, not from moodboards.

- **Wei Huang** ([@w__h_](https://x.com/w__h_), [site](https://weiweihuanghuang.github.io/)): designs, produces, and engineers fonts (Work Sans, Fragment Mono). Their site uses one typeface, one ink (`#025be0`), one paper (`#fff3f0`), tuned underlines (`0.08em` thick, `0.15em` offset), and hanging bullets. Lines worth keeping: "having taste means not being one shotted by things"; "Inter is coworker font"; "gotta love product designers. Let's make the labels on the iPad keyboard smaller for no reason". They also named "default illustrator palette core" as a current trend, and reposted the point that books "do not induce the urgency" animated media does.
- **Rasmus Andersson** ([rsms.me](https://rsms.me)): made Inter. His own site runs on a base unit (half the font size), line height as a multiple of it, separate text and display cuts, and secondary text as the foreground at lower alpha rather than as a new grey.
- **Robin Sloan** ([robinsloan.com](https://www.robinsloan.com)) and **Craig Mod** ([craigmod.com](https://craigmod.com)): writers who set their own reading surfaces. Each typeface has a job. OpenType features (ligatures, small caps, figure styles) are switched on deliberately. The page is treated as a printed object.
- **Matthew Butterick** ([Practical Typography](https://practicaltypography.com)): body text at 15–25px on screens, 45–90 characters per line, line spacing 120–145%, curly quotes and real dashes, caps only with letterspacing.
- **Are.na** ([are.na](https://www.are.na)): calm, connective, non-urgent software. It's the model for what a reading tool should feel like.

The common thread: **decide every default, give each typeface a job, and let the text be the interface.** A book whose typeface is whatever the OS falls back to has not made a decision.

## The Bookkit system

**Two voices.** The book is set in **Newsreader** (Production Type, OFL; optical sizes 6–72, so headings get the display cut and body text gets the text cut automatically). The **apparatus** — everything the compiler adds around the book: navigation, breadcrumbs, mechanism slugs and contract labels (`This is`, `Predictions`), status, file sizes, versions, filters — is set in **Fragment Mono** (Wei Huang, OFL). The split mirrors Bookkit's own model: author prose versus compiled structure. Readers can tell at a glance which is which.

**One paper, one ink, one rubric.** Tokens in `bookkit.css`:

| Token | Use |
| --- | --- |
| `--color-paper` | the page; surfaces are the same paper, not boxes on it |
| `--color-ink` | text, rules, filled buttons |
| `--color-muted`, `--color-faint`, `--color-border`, `--color-rule` | ink mixed toward paper; never a new hue |
| `--color-rubric` | the single accent, after rubrication in manuscripts: hover, focus, current item, selection, the progress line |

Status colours (`--color-success`, `--color-warning`, `--color-danger`) stay for author tools and states, not decoration.

**Structure by rules and space, not boxes.** Index entries sit under a hairline (`border-top`). Reading pages have no cards, shadows, or gradients. `--radius-*` tokens are 2px for the few controls that remain boxed.

## Rules

Do:

- Body text at `--text-md` (19px desktop, 18px phone), leading 1.5, measure around 65–70 characters (`--reader-content-width`).
- Headings in the text face at weight 450–500, `text-wrap: balance`; body `text-wrap: pretty`, old-style proportional figures, hanging punctuation, `hyphens: auto` on phones.
- Links: ink with a faint 1px underline at `0.2em` offset; rubric on hover.
- Hang list markers (en dash) in the margin so the text edge stays straight.
- Running head = the short title (before the colon), italic, one line on phones.
- Typographic punctuation in titles and config strings: `’ “ ” – — …`, never `' " - -- ...`.
- Show state only when it changes what the reader does (no "Latest" badge on the latest version; ⌘K only where there is a keyboard).
- Reading order is the author's: numbered files or `order`, never alphabetical.

Don't:

- Ship a font stack that names a face the page never loads.
- Reach for Inter, system-ui, or Merriweather by default for a book. They read as dashboard or template.
- Add pills, chips, badges, cards-in-cards, glass blur, drop shadows, or gradient fills to reading surfaces.
- Uppercase-and-track labels in the text face. If it's a label, it belongs to the apparatus voice.
- Shrink text for elegance. Apparatus text bottoms out at `--text-apparatus` (13px).
- Add urgency: "New", progress pressure, animated attention-getters.

## Review checklist

1. Screenshot before and after: desktop (1440) and phone (390), light and dark, on a chapter, a mechanism, an index, and the home page. Open the menu on both widths.
2. Every element is either book voice or apparatus voice, and in the matching face.
3. No new colour that isn't paper, ink, rubric, or a status token.
4. No new `box-shadow`, gradient, or radius above `--radius-control`.
5. Body measure stays within 45–90 characters at every width.
6. The first screen on a phone shows the title and the start of the text, not chrome.
7. Run `bun run verify` (it builds the books your change touches and runs `check:build`); `bun run verify -- --all` before a large UI change.

## Canonical docs

- `AGENTS.md` for invariants
- `docs/bets.md` for what gets worked on
- `docs/architecture.md` for where styles and components live
