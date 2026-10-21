import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { isReleasedStatus } from "../packages/astro-bookkit/src/schemas/status";
import { extractBookStatusFromSource } from "../packages/astro-bookkit/src/validators/frame-config";
import { listBookDirs, optionalArg, repoRoot } from "./_lib";
import { formatInspection, inspectBuildOutput } from "./lib/build-output";
import { exitOnHelp } from "./lib/cli";
import {
	extractPdfExportEnabled,
	extractPreviewAccessEnabled,
	extractSiteConfig,
} from "./lib/site-config";

/**
 * Verifies each book's `dist/` is deployable: real pages (not preview lockouts),
 * PDF and EPUB exports that pass the engine's structural checks (the PDF only
 * when the book has one), the SEO artifacts a public host needs, and one site URL
 * across all of them. The book's status sets the rest: a published or stable
 * book must be indexable and have chapters; any other book must be noindex.
 * Preview access is refused, since a static host cannot enforce it. Run after
 * `bun run build:all`.
 */

exitOnHelp({
	summary:
		"Checks each book's built dist/ is deployable: real pages, PDF and EPUB\nexports that pass their structural checks, the SEO files a public host\nneeds, one site URL across all of them, and the indexing its status\nsets.",
	usage: ["bun run check:build [--book <book>]"],
	options: [["--book <book>", "One book (default: every book under apps/)"]],
	notes:
		"Run it after a build (bun run build:all, or bun run bookkit build <book>).",
	examples: ["bun run check:build", "bun run check:build -- --book on-call"],
});

const root = repoRoot();
const requested = optionalArg("--book");
const books = requested ? [requested] : listBookDirs();

if (books.length === 0) {
	console.error("No books found under apps/.");
	process.exit(1);
}

let failed = 0;

for (const book of books) {
	const appDir = join(root, "apps", book);
	if (!existsSync(appDir)) {
		console.error(`Book "${book}" not found under apps/.`);
		process.exit(1);
	}

	const configPath = join(appDir, "src", "book.config.ts");
	const config = existsSync(configPath)
		? readFileSync(configPath, "utf8")
		: undefined;
	const status = config
		? (extractBookStatusFromSource(config) ?? "draft")
		: undefined;

	const result = await inspectBuildOutput({
		book,
		distDir: join(appDir, "dist"),
		published: status === undefined ? undefined : isReleasedStatus(status),
		previewAccessOnStaticSite:
			config !== undefined &&
			extractPreviewAccessEnabled(config) &&
			extractSiteConfig(config)?.runtime !== "server",
		requireChapters: status !== undefined && status !== "draft",
		pdf: config === undefined || extractPdfExportEnabled(config),
	});

	for (const line of formatInspection(result)) {
		console.log(line);
	}
	if (!result.ok) failed += 1;
}

if (failed > 0) {
	console.error(`\nBuild output check failed for ${failed} book(s).`);
	process.exit(1);
}

console.log(`\nBuild output check passed (${books.length} book(s)).`);
