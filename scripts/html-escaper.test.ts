import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createReleaseNotesRss } from "../packages/astro-bookkit/src/releases/rss";
import { renderBookIcons } from "../packages/astro-bookkit/src/seo/book-icons";
import { createSitemapXml } from "../packages/astro-bookkit/src/seo/sitemap";
import { repoRoot } from "./_lib";

/**
 * Text goes into HTML and XML through one escaper, `escapeHtml` in
 * `utils/character-references.ts`. There were three, and they disagreed on
 * the apostrophe: `&#39;`, `&apos;`, or left as written. This test reads the
 * engine, its templates, the scripts, and the books' pages for another, and
 * checks that what the engine writes as XML escapes as its HTML does.
 */

const root = repoRoot();
const ESCAPER = "packages/astro-bookkit/src/utils/character-references.ts";

const SOURCES = [
	"packages/astro-bookkit/src",
	"packages/astro-bookkit/templates",
	"packages/create-bookkit/src",
	"scripts",
	...readdirSync(join(root, "apps")).flatMap((book) => [
		`apps/${book}/src/pages`,
		`apps/${book}/src/layouts`,
		`apps/${book}/src/lib`,
	]),
];

const files = (dir: string): string[] =>
	existsSync(join(root, dir))
		? readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
				const path = `${dir}/${entry.name}`;
				if (entry.isDirectory()) {
					return entry.name === "node_modules" ? [] : files(path);
				}
				return /\.(astro|ts|js|mjs)$/.test(entry.name) &&
					!/\.test\.ts$/.test(entry.name)
					? [path]
					: [];
			})
		: [];

/** A quoted character reference: what an escaper writes in place of `&`, `<`, `>`, `"`, or `'`. */
const REFERENCE_LITERAL = /["'`]&(?:amp|lt|gt|quot|apos|#39|#x27);["'`]/;
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;

const BOOK_TITLE = `Fish & 'Chips' <"live">`;
const ESCAPED = "Fish &amp; &#39;Chips&#39; &lt;&quot;live&quot;&gt;";

describe("escaping text into HTML and XML", () => {
	it("has one escaper", () => {
		const others = SOURCES.flatMap(files).flatMap((file) =>
			file === ESCAPER
				? []
				: readFileSync(join(root, file), "utf8")
						.split("\n")
						.flatMap((line, index) =>
							!COMMENT.test(line) && REFERENCE_LITERAL.test(line)
								? [`${file}:${index + 1}: ${line.trim()}`]
								: [],
						),
		);
		expect(others).toEqual([]);
	});

	it("escapes the RSS feed, the sitemap, and the site icon as the pages", async () => {
		const rss = createReleaseNotesRss({
			siteUrl: "https://book.example",
			bookTitle: BOOK_TITLE,
			releases: [],
		});
		expect(rss).toContain(`<title>${ESCAPED} Release Notes</title>`);

		const sitemap = createSitemapXml([
			{ url: "https://book.example/read/?a=1&b='2'" },
		]);
		expect(sitemap).toContain(
			"<loc>https://book.example/read/?a=1&amp;b=&#39;2&#39;</loc>",
		);

		const icon = new TextDecoder().decode(
			(await renderBookIcons(BOOK_TITLE)).svg,
		);
		expect(icon).toContain(`<title>${ESCAPED}</title>`);
	});
});
