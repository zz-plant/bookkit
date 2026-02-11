# SEO audit — bad-people.book

Date: 2026-02-11
Scope: `apps/bad-people` + shared SEO pipeline in `packages/astro-bookkit/src/seo`

## Executive summary

The previously identified SEO follow-ups are now implemented:

- production indexing is environment-gated (indexable in production by default, overridable with `BOOKKIT_NOINDEX=true`)
- chapter export dynamic routes now provide static paths for build stability
- Open Graph and Twitter metadata support has been expanded with additional optional fields

## Implemented changes

1. **Indexability controls moved to launch-safe defaults**
   - `site.indexable` is now derived from environment in `book.config.ts`.
   - Production builds are indexable unless explicitly disabled.

2. **Build stability for chapter export routes**
   - Added `getStaticPaths()` for both chapter EPUB/PDF export routes.
   - Added shared `chapterExportSlugs` helper to generate route params from chapter frontmatter slugs.

3. **SEO metadata enrichment at engine layer**
   - Added optional SEO props for:
     - `og:site_name`
     - `og:locale`
     - `og:image:alt`
     - `twitter:image:alt`
   - Wired props from layout state through SEO config into rendered `<meta>` tags.

## Residual non-blocking warnings

- Astro build still emits warnings about use of `Astro.request.headers` on prerendered routes.
- Vite warns that `import.meta.glob(..., { as: "raw" })` is deprecated in favor of `query: "?raw"`.

These are not blocking the build, but should be cleaned up in a future maintenance pass.

## Architectural boundary check

- Book-specific indexability behavior remains in `apps/bad-people/src/book.config.ts`.
- Reusable metadata capability is implemented in `packages/astro-bookkit`.
- No book-specific logic was placed in content files.
