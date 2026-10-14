import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleCheckCorpus } from "./check_corpus";
import { handleFindSimilarMechanisms } from "./find_similar_mechanisms";

/**
 * An MCP server has no terminal to confirm the embedding model download, so a
 * semantic request with no cached model compares wording only. The result has
 * to say so, and how to allow the download.
 */

const workspaceRoot = join(import.meta.dir, "../../../../..");
const saved = {
	cache: process.env.BOOKKIT_MODEL_CACHE,
	download: process.env.BOOKKIT_DOWNLOAD_MODEL,
};
let emptyCache: string;

beforeAll(() => {
	emptyCache = mkdtempSync(join(tmpdir(), "bookkit-no-model-"));
	process.env.BOOKKIT_MODEL_CACHE = emptyCache;
	delete process.env.BOOKKIT_DOWNLOAD_MODEL;
});

afterAll(() => {
	rmSync(emptyCache, { recursive: true, force: true });
	for (const [key, value] of [
		["BOOKKIT_MODEL_CACHE", saved.cache],
		["BOOKKIT_DOWNLOAD_MODEL", saved.download],
	] as const) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

const options = { bookTitle: "Workspace", workspaceRoot };

describe("semantic MCP tools without a downloaded model", () => {
	it("check_corpus says it compared wording only, and how to allow the download", async () => {
		const result = await handleCheckCorpus({
			options,
			args: { semantic: true },
		});

		expect(result.summary).toContain("Compared wording only");
		expect(result.summary).toContain("BOOKKIT_DOWNLOAD_MODEL=1");
		const report = result.payload?.report as { semantic?: boolean } | undefined;
		expect(report?.semantic).toBe(false);
	}, 60_000);

	it("check_corpus adds nothing when wording is all that was asked for", async () => {
		const result = await handleCheckCorpus({ options, args: {} });

		expect(result.summary).not.toContain("Compared wording only");
	}, 60_000);

	it("find_similar_mechanisms says it ranked by wording only", async () => {
		const result = await handleFindSimilarMechanisms({
			options,
			args: { title: "Waiting as leverage", semantic: true },
		});

		expect(result.summary).toContain("Ranked by wording only");
		expect(result.summary).toContain("BOOKKIT_DOWNLOAD_MODEL=1");
	}, 60_000);
});
