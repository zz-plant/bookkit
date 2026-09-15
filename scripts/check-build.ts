import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { listBookDirs, optionalArg, repoRoot } from "./_lib";
import { formatInspection, inspectBuildOutput } from "./lib/build-output";

/**
 * Verifies each book's `dist/` is deployable: real pages (not preview lockouts),
 * real PDF/EPUB exports, the SEO artifacts a public host needs, and one site URL
 * across all of them. Run after `bun run build:all`.
 *
 *   bun run check:build            # every book under apps/
 *   bun run check:build --book x   # one book
 */

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
	const published =
		existsSync(configPath) &&
		/status:\s*"published"/.test(readFileSync(configPath, "utf8"));

	const result = inspectBuildOutput({
		book,
		distDir: join(appDir, "dist"),
		published,
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
