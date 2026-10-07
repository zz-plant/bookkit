import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { listBookDirs, repoRoot } from "./_lib";

export const shimTemplateRoot = join(
	repoRoot(),
	"packages",
	"astro-bookkit",
	"templates",
	"book-app",
);

export const shimPaths = [
	"astro.config.mjs",
	"public/_headers",
	"src/lib/book-runtime.ts",
	"src/lib/book-entrypoints.ts",
	"src/lib/exports.ts",
	"src/lib/og.ts",
	"src/lib/release-notes.ts",
	"src/lib/versions.ts",
	"src/pages/api/analytics.json.ts",
	"src/pages/api/export-analytics.json.ts",
	"src/pages/api/feedback.json.ts",
	"src/pages/api/mcp.json.ts",
	"src/pages/api/preview-analytics.json.ts",
	"src/pages/api/release-analytics.json.ts",
	"src/pages/api/release-email.json.ts",
	"src/pages/api/release-webhook.json.ts",
	"src/pages/exports/book.epub.ts",
	"src/pages/exports/book.pdf.ts",
	"src/pages/exports/chapters/[slug].epub.ts",
	"src/pages/exports/chapters/[slug].pdf.ts",
	"src/pages/robots.txt.ts",
	"src/pages/sitemap.xml.ts",
	"src/pages/search-index.json.ts",
	"src/pages/release-notes.xml.ts",
	"src/pages/404.astro",
	"src/pages/new-book.astro",
	"src/pages/versions.astro",
	"src/pages/read/analytics.astro",
	"src/pages/read/tools.astro",
	"src/layouts/BaseLayout.astro",
	"src/pages/read/chapters/[slug].astro",
	"src/pages/read/mechanisms/[slug].astro",
	"src/pages/read/glossary/[slug].astro",
	"src/pages/read/toolkit/[slug].astro",
	"src/pages/read/examples/[...slug].astro",
] as const;

export const listShimBooks = () => listBookDirs();

export const getShimTemplatePath = (relativePath: string) =>
	join(shimTemplateRoot, relativePath);
export const getBookShimPath = (book: string, relativePath: string) =>
	join(repoRoot(), "apps", book, relativePath);

export const readShimTemplate = (relativePath: string) => {
	const templatePath = getShimTemplatePath(relativePath);
	if (!existsSync(templatePath)) {
		throw new Error(`Missing shim template: ${templatePath}`);
	}
	return readFileSync(templatePath, "utf8");
};

export const syncShimTemplatesToBook = (book: string) => {
	for (const relativePath of shimPaths) {
		const templatePath = getShimTemplatePath(relativePath);
		const targetPath = getBookShimPath(book, relativePath);

		if (!existsSync(templatePath)) {
			throw new Error(`Missing shim template: ${templatePath}`);
		}

		mkdirSync(dirname(targetPath), { recursive: true });
		copyFileSync(templatePath, targetPath);
	}
};
