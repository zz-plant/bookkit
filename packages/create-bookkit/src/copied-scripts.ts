/**
 * The repo scripts a standalone project gets, relative to `scripts/`. Each
 * one's relative imports must resolve inside the generated project: to
 * another file in this list, or to the vendored `packages/astro-bookkit/`.
 * `copied-scripts.test.ts` checks that, so a script that grows a new local
 * import fails the tests instead of failing in someone's new project.
 */
export const COPIED_SCRIPTS = [
	"_lib.ts",
	"lib/content-frontmatter.ts",
	"lib/import-markdown.ts",
	"lib/load-book.ts",
	"import-book-from-markdown.ts",
	"check-suggestions.ts",
	"check-runbooks.ts",
] as const;
