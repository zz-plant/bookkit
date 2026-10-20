# __BOOK_TITLE__

A Bookkit book. `src/book.config.ts` holds the author's decisions (frame, objectives, constraints); `src/content/book/` holds the content the engine validates and renders.

## Commands

Run these from the workspace root:

```bash
bun run bookkit dev __BOOK_SLUG__                # preview with live reload
bun run bookkit check __BOOK_SLUG__              # structure, plus mechanisms that overlap other books
bun run bookkit build __BOOK_SLUG__
bun run bookkit deploy __BOOK_SLUG__ --dry-run   # check content, build, verify dist/, without publishing
```

## Replace first

- `src/book.config.ts`: the title, `site.url`, objectives, frame intent, and causal stance. The placeholder text shows on the About this book page (`/read/overview`) until you do.
- The starter files in `src/content/book/`: one overview chapter, mechanism, tool, example, glossary term, and release note. Each empty field carries a comment saying what it needs; `bun run bookkit check <file>` lists what is still missing.

## Which files are yours

Files copied from `packages/astro-bookkit/templates/book-app/` are wrappers every book keeps identical; `bun run check:shims` fails if one drifts. Change them in the template and run `bun run sync:shims`. The home page, the reading hub and the mechanisms index are among them: their copy is `home`, `readHub` and `mechanismsIndex` in `src/book.config.ts`. Everything else in this folder (the breadcrumb copy in `src/lib/read-copy.ts`, the examples index) belongs to this book.
