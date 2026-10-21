import { afterAll, beforeAll } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";

/**
 * Loaded before every test file (bunfig.toml). `bun test --parallel` runs
 * each file in a process of its own, all in the repository's root, so these
 * hooks run around each file; a plain `bun test` runs them once, around the
 * whole run. They run after the file's own hooks.
 *
 * Reader data: the engine's API routes would otherwise keep it in the
 * repository (`.bookkit/`). Each test file gets a data folder of its own
 * instead, so no test reads another's records or leaves any in the
 * repository. Child processes inherit it; a test that checks the default
 * folder removes BOOKKIT_DATA_DIR from their env.
 *
 * The repository's books: a test that creates or deletes anything in apps/
 * fails the run. Tests make and remove books in a scratch workspace
 * (book-workspace.fixture.ts) or the OS temp folder; one that missed did
 * delete real books. Only files and folders are compared, not what they
 * hold, and what builds, dev servers, exports and proposals write is left
 * out.
 */
let dataDir: string | undefined;

const REPO = join(import.meta.dir, "..", "..");
const APPS = join(REPO, "apps");

/** Written anywhere in a book by builds, dev servers, and deploys (gitignored). */
const GENERATED = new Set([
	"node_modules",
	"dist",
	".astro",
	".bookkit",
	".wrangler",
]);
/** Written at the top of a book's folder by `export:gitbook` and `propose --write` (gitignored). */
const BOOK_OUTPUT = new Set(["exports", "proposals"]);

/** A folder's entries; none if it was removed while it was listed. */
const entriesOf = (dir: string) => {
	try {
		return readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
};

/** Every file and folder in apps/, relative to the repository, generated output left out. */
const listApps = (): string[] => {
	const found: string[] = [];
	const walk = (dir: string, depth: number) => {
		for (const entry of entriesOf(dir)) {
			if (entry.name === ".DS_Store") continue;
			const folder = entry.isDirectory();
			if (folder && GENERATED.has(entry.name)) continue;
			if (folder && depth === 1 && BOOK_OUTPUT.has(entry.name)) continue;
			const path = join(dir, entry.name);
			found.push(relative(REPO, path).split(sep).join("/"));
			if (folder) walk(path, depth + 1);
		}
	};
	walk(APPS, 0);
	return found.sort();
};

/** `paths` without those inside a folder that is also listed. */
const topmost = (paths: string[]): string[] => {
	const listed = new Set(paths);
	return paths.filter((path) => {
		for (let dir = dirname(path); dir !== "."; dir = dirname(dir)) {
			if (listed.has(dir)) return false;
		}
		return true;
	});
};

const SHOWN = 20;

const changeReport = (created: string[], deleted: string[]): string => {
	const lines = [
		...topmost(created).map((path) => `  created ${path}`),
		...topmost(deleted).map((path) => `  deleted ${path}`),
	];
	const more = lines.length - SHOWN;
	const during = process.env.BUN_TEST_WORKER_ID
		? `while ${relative(REPO, Bun.main)} ran (or a test file running beside it)`
		: "during this test run";
	return [
		`A test changed the repository's apps/ ${during}:`,
		...lines.slice(0, SHOWN),
		...(more > 0 ? [`  and ${more} more`] : []),
		"Tests must make and remove books in a scratch workspace (scripts/lib/book-workspace.fixture.ts) or the OS temp folder. Restore apps/ by hand: git status apps/",
	].join("\n");
};

let appsBefore: string[] = [];

beforeAll(() => {
	dataDir = mkdtempSync(join(tmpdir(), "bookkit-test-data-"));
	process.env.BOOKKIT_DATA_DIR = dataDir;
	appsBefore = listApps();
});

afterAll(() => {
	if (dataDir) rmSync(dataDir, { recursive: true, force: true });
	delete process.env.BOOKKIT_DATA_DIR;
	const after = listApps();
	const before = new Set(appsBefore);
	const now = new Set(after);
	const created = after.filter((path) => !before.has(path));
	const deleted = appsBefore.filter((path) => !now.has(path));
	if (created.length > 0 || deleted.length > 0) {
		throw new Error(changeReport(created, deleted));
	}
});
