import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listBookDirs, repoRoot } from "./_lib";

// Rows sorted so the flagship runbook demo leads; the underlying dir order
// (listBookDirs) is untouched so `bookkit dev` keeps its own default.
const FLAGSHIP_FIRST = ["on-call"];

const books = listBookDirs().sort((a, b) => {
	const rank = (slug: string): number => {
		const idx = FLAGSHIP_FIRST.indexOf(slug);
		return idx === -1 ? FLAGSHIP_FIRST.length : idx;
	};
	return rank(a) - rank(b);
});
if (books.length === 0) {
	console.log("No books found under apps/*");
	process.exit(0);
}

for (const book of books) {
	const pkgPath = join(repoRoot(), "apps", book, "package.json");
	let name = `@books/${book}`;
	if (existsSync(pkgPath)) {
		try {
			const parsed = JSON.parse(readFileSync(pkgPath, "utf8")) as {
				name?: string;
			};
			if (parsed.name) name = parsed.name;
		} catch {
			// ignore malformed package.json
		}
	}
	console.log(`${book}\t${name}`);
}
