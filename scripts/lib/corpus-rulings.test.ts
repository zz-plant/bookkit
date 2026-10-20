import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { repoRoot } from "../_lib";
import { addDistinctRuling, findRuling } from "./corpus-rulings";

/**
 * addDistinctRuling: a ruling is added as text, in the file's own layout, so
 * the hand-written rest of corpus.json is untouched and Biome keeps it as is.
 */

const CORPUS = `{
	"$comment": "Rulings.",
	"bet": { "id": "B1", "since": "2026-10-07" },
	"books": ["a", "b"],
	"distinct": [
		{
			"pair": ["one", "two"],
			"reason": "Different levers."
		}
	],
	"merged": []
}
`;

/** The text as Biome would format it. */
const biomeFormat = (text: string): string => {
	const result = Bun.spawnSync(
		[
			join(repoRoot(), "node_modules", ".bin", "biome"),
			"format",
			"--stdin-file-path=corpus.json",
		],
		{ stdin: new TextEncoder().encode(text), stdout: "pipe", stderr: "pipe" },
	);
	return result.stdout.toString();
};

describe("addDistinctRuling", () => {
	it("adds the ruling after the last one and leaves the rest as written", () => {
		const updated = addDistinctRuling(CORPUS, {
			pair: ["three", "four"],
			reason: 'Says "why", in the author\'s words.',
		});
		expect(updated).toBe(
			CORPUS.replace(
				'"Different levers."\n\t\t}\n',
				'"Different levers."\n\t\t},\n\t\t{\n\t\t\t"pair": ["three", "four"],\n\t\t\t"reason": "Says \\"why\\", in the author\'s words."\n\t\t}\n',
			),
		);
		expect(biomeFormat(updated)).toBe(updated);
		expect(
			findRuling(JSON.parse(updated).distinct, "four", "three")?.reason,
		).toBe('Says "why", in the author\'s words.');
	});

	it("fills an empty list, and puts a long pair on its own lines as Biome would", () => {
		const empty = CORPUS.replace(
			/"distinct": \[[\s\S]*?\],\n\t"merged"/,
			'"distinct": [],\n\t"merged"',
		);
		const updated = addDistinctRuling(empty, {
			pair: [
				"a-rather-long-mechanism-slug-name",
				"another-quite-long-mechanism-slug",
			],
			reason: "Long slugs.",
		});
		expect(JSON.parse(updated).distinct).toHaveLength(1);
		expect(biomeFormat(updated)).toBe(updated);
	});

	it("starts corpus.json when there is none", () => {
		const created = addDistinctRuling(null, {
			pair: ["one", "two"],
			reason: "Different levers.",
		});
		expect(JSON.parse(created)).toEqual({
			distinct: [{ pair: ["one", "two"], reason: "Different levers." }],
		});
		expect(biomeFormat(created)).toBe(created);
	});
});
