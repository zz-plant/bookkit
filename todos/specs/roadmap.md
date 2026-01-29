# Roadmap — Platform feature parity (GitBook + peers)

## High-impact wins (most leverage for Bookkit)
- **Instant full-text search with filters** (title/body/mechanism/glossary) and keyboard shortcut focus.
- **Versioned publishing** (stable release URLs, draft previews, and per-version navigation).
- **Multi-format export** (PDF/EPUB/Kindle-ready) with consistent styling + cover metadata.
- **Reader feedback capture** (reactions + inline comments tied to headings).
- **Access control & private sharing** (invite-only readers, link expiry, basic SSO).
- **Reading analytics** (top pages, drop-off, search terms, and time-on-page).

## Supporting capabilities (unlock the wins above)
- **Search index builder** that runs in CI and ships JSON bundles.
- **Content diffing** between versions for release notes + migration hints.
- **Feedback inbox** routed by chapter/mechanism with export to CSV.
- **Export templates** for print + e-reader profiles (font scale, margins, TOC depth).
- **Permissions model** for books/sections (public, private, invite-only).
- **Analytics event schema** aligned to modules/mechanisms.

## Nice-to-have parity items
- **AI-assisted summaries** per chapter (opt-in, with “why it matters” lens).
- **Integrations** (Slack/Discord notifications, GitHub sync status, Notion embeds).
- **Reader progress** (completion tracking, bookmarks, highlights).
