# Match Day to July 1

A Bookkit book. `src/book.config.ts` holds the author's decisions (frame, objectives, constraints); `src/content/book/` holds the content the engine validates and renders.

## Commands

Run these from the workspace root:

```bash
bun run bookkit dev match-to-july                # preview with live reload
bun run bookkit check match-to-july              # structure, plus mechanisms that overlap other books
bun run bookkit build match-to-july
bun run bookkit deploy match-to-july --dry-run   # check content, build, verify dist/, without publishing
```

## Replace first

- `src/book.config.ts`: the title, `site.url`, objectives, frame intent, and causal stance. The placeholder text shows on the About this book page (`/read/overview`) until you do.
- The starter files in `src/content/book/`: one overview chapter, mechanism, tool, example, glossary term, and release note. Each empty field carries a comment saying what it needs; `bun run bookkit check <file>` lists what is still missing.

## Which files are yours

`src/book.config.ts`, `src/content/book/`, this README, `TODOS.md`, `package.json`, and `wrangler.jsonc` are this book's. The site's pages come from the engine (`bookkit()` in `astro.config.mjs` serves them); their copy is `home`, `readHub` and `mechanismsIndex` in `src/book.config.ts`. A file in `src/pages/` replaces the engine's page at the same URL ([A book's own pages](../../docs/guide/concepts.md#a-books-own-pages)). `astro.config.mjs`, `tsconfig.json` and `public/_headers` are copied from `packages/astro-bookkit/templates/book-app/` and kept identical in every book; `bun run check:shims` fails if one drifts.
