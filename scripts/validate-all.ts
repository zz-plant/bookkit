import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { listBookDirs, repoRoot } from "./_lib";

/**
 * Validates every book under apps/ with validate-book.ts, each under the rules
 * its status sets. Exits 1 when any book has an error.
 */

const books = listBookDirs();
if (books.length === 0) {
	console.error(`No books found under ${join(repoRoot(), "apps")}.`);
	process.exit(1);
}

const failed: string[] = [];
for (const book of books) {
	// This process's own bun, so a missing `bun` on PATH cannot skip a book.
	const result = spawnSync(
		process.execPath,
		[join(repoRoot(), "scripts", "validate-book.ts"), "--book", book],
		{ cwd: repoRoot(), stdio: "inherit" },
	);
	if (result.status !== 0) failed.push(book);
}

console.log(
	failed.length > 0
		? `\n✗ ${failed.length} of ${books.length} books failed validation: ${failed.join(", ")}`
		: `\n✓ ${books.length} books validated with no errors`,
);
process.exit(failed.length > 0 ? 1 : 0);
