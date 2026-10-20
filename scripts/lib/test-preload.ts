import { afterAll, beforeAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Loaded before every test file (bunfig.toml). `bun test --parallel` runs
 * files in several processes at once, all in the repository's root, where the
 * engine's API routes would otherwise keep reader data (`.bookkit/`). Each
 * test file gets a data folder of its own instead, so no test reads another's
 * records or leaves any in the repository. Child processes inherit it; a test
 * that checks the default folder removes BOOKKIT_DATA_DIR from their env.
 */
let dataDir: string | undefined;

beforeAll(() => {
	dataDir = mkdtempSync(join(tmpdir(), "bookkit-test-data-"));
	process.env.BOOKKIT_DATA_DIR = dataDir;
});

afterAll(() => {
	if (dataDir) rmSync(dataDir, { recursive: true, force: true });
	delete process.env.BOOKKIT_DATA_DIR;
});
