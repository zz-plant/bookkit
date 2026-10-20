import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { repoRoot } from "./_lib";
import { parseFrontmatter } from "./lib/content-frontmatter";
import { rebindCode, rebindContent } from "./lib/merge-mechanisms";

/**
 * bookkit merge and bookkit sync, in a workspace of their own. Book "one"
 * has both mechanisms; book "two" has only the one merged away, so it takes
 * the kept slug; book "three" is outside the shared corpus.
 */

let workspace: string;

const mechanism = (
	slug: string,
	title: string,
	definition: string,
	item: string,
	body = "",
) => `---
slug: ${slug}
status: draft
title: "${title}"
definition: "${definition}"
is:
  - "${item} is."
isNot:
  - "${item} is not."
predictions:
  - "${item} predicts."
tests:
  - "${item} tests."
---
${body}`;

const FILES: Record<string, string> = {
	"corpus.json": `{
	"books": ["one", "two"],
	"distinct": [
		{
			"pair": ["waiting-game", "tidy-desk"],
			"reason": "Stalling is not filing."
		},
		{
			"pair": ["waiting-game", "form-loop"],
			"reason": "Old ruling on the dropped one."
		},
		{
			"pair": ["slow-walk", "form-loop"],
			"reason": "The kept one's own ruling."
		}
	],
	"merged": []
}
`,
	"apps/one/src/content/book/mechanisms/slow-walk.mdx": mechanism(
		"slow-walk",
		"Slow walk",
		"Processing a request at a crawl on purpose.",
		"Slow",
		"\n# Slow walk\n\nKeep's notes.\n",
	),
	"apps/one/src/content/book/mechanisms/waiting-game.mdx": mechanism(
		"waiting-game",
		"Waiting game",
		"Stalling until the other side gives up.",
		"Wait",
		"\n# Waiting game\n\nDrop's notes.\n",
	),
	"apps/one/src/content/book/glossary/slow-walk.mdx":
		'---\nslug: slow-walk\nstatus: draft\nterm: "Slow walk"\n---\n\nWork done at a crawl on purpose.\n',
	"apps/one/src/content/book/glossary/waiting-game.mdx":
		'---\nslug: waiting-game\nstatus: draft\nterm: "Waiting game"\n---\n\nStalling as a tactic.\n',
	"apps/one/src/content/book/examples/waiting-game/stall.mdx":
		'---\nmechanism: waiting-game\ndomain: work\ntitle: "Stall"\nstatus: draft\n---\n\nA stall.\n',
	"apps/one/src/content/book/toolkit/waiting-game--deadline.mdx":
		'---\nslug: waiting-game--deadline\nstatus: draft\nmechanism: waiting-game\nname: "Deadline"\n---\n\nSet one.\n',
	"apps/one/src/content/book/chapters/01-intro.mdx": `---
slug: intro
status: draft
title: "Intro"
mechanisms:
  - slow-walk
  - waiting-game
---

See [the stall](/read/mechanisms/waiting-game) and \`waiting-game\`.
He called it "waiting-game" in passing.

- slow-walk
- waiting-game
`,
	"apps/one/src/book.config.ts": `export const bookConfig = {
	mechanisms: [
		{
			slug: "slow-walk",
			focus: "Crawl.",
		},
		{
			slug: "waiting-game",
			focus: "Stall.",
		},
	],
	glossaryFocus: [
		"slow walk",
		"waiting game",
	],
	href: "/read/glossary/waiting-game",
};
`,
	"apps/one/src/pages/read/mechanisms/index.astro": `---
const urgency = {
	"slow-walk": "calm",
	"waiting-game": "urgent",
};
---
`,
	"apps/two/src/content/book/mechanisms/waiting-game.mdx": mechanism(
		"waiting-game",
		"Waiting game",
		"Stalling until the other side gives up.",
		"Wait",
		"\nBook two's own notes.\n",
	),
	"apps/two/src/content/book/mechanisms/tidy-desk.mdx": mechanism(
		"tidy-desk",
		"Tidy desk",
		"Filing every record by colour.",
		"Tidy",
	),
	"apps/two/src/content/book/glossary/waiting-game.mdx":
		'---\nslug: waiting-game\nstatus: draft\nterm: "Waiting game"\n---\n\nStalling as a tactic.\n',
	"apps/two/src/content/book/chapters/01-start.mdx":
		'---\nslug: start\nstatus: draft\ntitle: "Start"\nmechanisms: [waiting-game, tidy-desk]\n---\n\nText.\n',
	"apps/two/src/book.config.ts": `export const bookConfig = {
	mechanisms: [{ slug: "waiting-game", focus: "Stall." }],
	glossaryFocus: ["waiting game"],
};
`,
	"apps/three/src/content/book/mechanisms/queue-reset.mdx": mechanism(
		"queue-reset",
		"Queue reset",
		"Sending people to the back of the line on any error.",
		"Queue",
	),
};

const at = (path: string) => join(workspace, path);
const read = (path: string) => readFileSync(at(path), "utf8");
const contractOf = (path: string) => {
	const { data } = parseFrontmatter(read(path));
	const { slug: _slug, status: _status, ...contract } = data;
	return contract;
};

const bookkit = (...args: string[]) => {
	const result = Bun.spawnSync(
		[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
		{ cwd: workspace, stdout: "pipe", stderr: "pipe" },
	);
	return {
		status: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
};

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-merge-"));
	for (const [path, text] of Object.entries(FILES)) {
		mkdirSync(dirname(at(path)), { recursive: true });
		writeFileSync(at(path), text);
	}
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("bookkit merge", () => {
	it("refuses without a reason, an unknown slug, a pair across corpora, or a pair ruled distinct", () => {
		expect(bookkit("merge", "slow-walk", "waiting-game").output).toContain(
			"--reason needs why they are one idea",
		);
		expect(
			bookkit("merge", "slow-walk", "waiting-gme", "--reason", "x").output,
		).toContain("Did you mean waiting-game?");
		const across = bookkit(
			"merge",
			"slow-walk",
			"queue-reset",
			"--reason",
			"x",
		);
		expect(across.status).toBe(1);
		expect(across.output).toContain("are in different corpora");
		const ruled = bookkit(
			"merge",
			"tidy-desk",
			"waiting-game",
			"--reason",
			"x",
		);
		expect(ruled.status).toBe(1);
		expect(ruled.output).toContain("is ruled distinct in corpus.json");
	});

	it("--dry-run lists every change and writes nothing", () => {
		const before = read("corpus.json");
		const dry = bookkit(
			"merge",
			"slow-walk",
			"waiting-game",
			"--reason",
			"Same lever.",
			"--dry-run",
		);
		expect(dry.status).toBe(0);
		expect(dry.output).toContain(
			"Would merge waiting-game into slow-walk in one, two:",
		);
		expect(dry.output).toContain(
			"→ apps/two/src/content/book/mechanisms/waiting-game.mdx → apps/two/src/content/book/mechanisms/slow-walk.mdx",
		);
		expect(dry.output).toContain("Nothing written (--dry-run).");
		expect(read("corpus.json")).toBe(before);
		expect(
			existsSync(at("apps/one/src/content/book/mechanisms/waiting-game.mdx")),
		).toBe(true);
	});

	it("makes one mechanism under the kept slug in every book, and records it", () => {
		const merged = bookkit(
			"merge",
			"slow-walk",
			"waiting-game",
			"--reason",
			"Same lever: time spent against the person who can least afford it.",
		);
		expect(merged.status).toBe(0);
		expect(merged.output).toContain("Merged waiting-game into slow-walk");
		expect(merged.output).toContain(
			"waiting-game--deadline keeps its slug and URL, and now binds to slow-walk.",
		);
		// The prose mention is left for the author, and named.
		expect(merged.output).toContain("Still naming waiting-game");
		expect(merged.output).toContain('He called it "waiting-game" in passing.');

		// One contract in both books: keep's definition, both lists.
		const one = "apps/one/src/content/book/mechanisms/slow-walk.mdx";
		const two = "apps/two/src/content/book/mechanisms/slow-walk.mdx";
		expect(contractOf(one)).toEqual(contractOf(two));
		expect(contractOf(one)).toMatchObject({
			title: "Slow walk",
			definition: "Processing a request at a crawl on purpose.",
			is: ["Slow is.", "Wait is."],
			tests: ["Slow tests.", "Wait tests."],
		});
		// Each book keeps its prose; book one gets the dropped file's after its own.
		expect(read(one)).toEndWith("Keep's notes.\n\nDrop's notes.\n");
		expect(read(two)).toContain("Book two's own notes.");
		expect(parseFrontmatter(read(two)).data.slug).toBe("slow-walk");
		for (const gone of [
			"apps/one/src/content/book/mechanisms/waiting-game.mdx",
			"apps/two/src/content/book/mechanisms/waiting-game.mdx",
			"apps/one/src/content/book/glossary/waiting-game.mdx",
			"apps/one/src/content/book/examples/waiting-game",
		]) {
			expect(existsSync(at(gone))).toBe(false);
		}

		// Glossary: the old term stays findable.
		expect(read("apps/one/src/content/book/glossary/slow-walk.mdx")).toContain(
			"Work done at a crawl on purpose. Also called waiting game.",
		);
		const moved = read("apps/two/src/content/book/glossary/slow-walk.mdx");
		expect(parseFrontmatter(moved).data).toMatchObject({
			slug: "slow-walk",
			term: "Slow walk",
		});
		expect(moved).toContain("Stalling as a tactic. Also called waiting game.");

		// References: frontmatter, links, code, lists; tools keep their slugs.
		expect(
			parseFrontmatter(
				read("apps/one/src/content/book/examples/slow-walk/stall.mdx"),
			).data.mechanism,
		).toBe("slow-walk");
		const tool = parseFrontmatter(
			read("apps/one/src/content/book/toolkit/waiting-game--deadline.mdx"),
		).data;
		expect(tool).toMatchObject({
			slug: "waiting-game--deadline",
			mechanism: "slow-walk",
		});
		const chapter = read("apps/one/src/content/book/chapters/01-intro.mdx");
		expect(parseFrontmatter(chapter).data.mechanisms).toEqual(["slow-walk"]);
		expect(chapter).toContain(
			"See [the stall](/read/mechanisms/slow-walk) and `slow-walk`.",
		);
		expect(chapter).toEndWith("\n- slow-walk\n");
		expect(
			parseFrontmatter(read("apps/two/src/content/book/chapters/01-start.mdx"))
				.data.mechanisms,
		).toEqual(["slow-walk", "tidy-desk"]);
		expect(
			read("apps/one/src/book.config.ts"),
		).toBe(`export const bookConfig = {
	mechanisms: [
		{
			slug: "slow-walk",
			focus: "Crawl.",
		},
	],
	glossaryFocus: [
		"slow walk",
	],
	href: "/read/glossary/slow-walk",
};
`);
		expect(
			read("apps/two/src/book.config.ts"),
		).toBe(`export const bookConfig = {
	mechanisms: [{ slug: "slow-walk", focus: "Stall." }],
	glossaryFocus: ["slow walk"],
};
`);
		expect(
			read("apps/one/src/pages/read/mechanisms/index.astro"),
		).not.toContain("waiting-game");

		// corpus.json: the merge with both as they were; rulings follow.
		const corpus = JSON.parse(read("corpus.json"));
		expect(corpus.merged).toHaveLength(1);
		expect(corpus.merged[0]).toMatchObject({
			into: "slow-walk",
			reason:
				"Same lever: time spent against the person who can least afford it.",
			before: [
				{ book: "one", slug: "waiting-game", title: "Waiting game" },
				{ book: "one", slug: "slow-walk", title: "Slow walk" },
			],
		});
		expect(corpus.distinct).toEqual([
			{ pair: ["slow-walk", "tidy-desk"], reason: "Stalling is not filing." },
			{
				pair: ["slow-walk", "form-loop"],
				reason: "The kept one's own ruling.",
			},
		]);
		// Biome would leave the file as written.
		const formatted = Bun.spawnSync(
			[
				join(repoRoot(), "node_modules", ".bin", "biome"),
				"format",
				"--stdin-file-path=corpus.json",
			],
			{ stdin: new TextEncoder().encode(read("corpus.json")), stdout: "pipe" },
		);
		expect(formatted.stdout.toString()).toBe(read("corpus.json"));
	});
});

describe("bookkit sync", () => {
	it("copies the contract edited last to the other books, or the one --from names", () => {
		const one = "apps/one/src/content/book/mechanisms/slow-walk.mdx";
		const two = "apps/two/src/content/book/mechanisms/slow-walk.mdx";
		expect(bookkit("sync", "slow-walk").output).toContain(
			"slow-walk already reads the same in",
		);
		writeFileSync(
			at(two),
			read(two).replace(
				"Processing a request at a crawl on purpose.",
				"Work slowed on purpose until the person gives up.",
			),
		);
		const later = new Date(Date.now() + 5000);
		utimesSync(at(two), later, later);
		const synced = bookkit("sync", "slow-walk");
		expect(synced.status).toBe(0);
		expect(synced.output).toContain(
			"Copied slow-walk's contract from two (the copy edited last",
		);
		expect(contractOf(one)).toEqual(contractOf(two));
		expect(read(one)).toContain("Keep's notes.");

		writeFileSync(
			at(one),
			read(one).replace("Slow is.", "Slow, on purpose, is."),
		);
		expect(bookkit("sync", "slow-walk", "--from", "two").status).toBe(0);
		expect(contractOf(one).is).toEqual(["Slow is.", "Wait is."]);
		expect(bookkit("sync", "slow-walk", "--from", "three").output).toContain(
			"three has no slow-walk",
		);
	});
});

describe("rebinding a slug", () => {
	const rebind = { drop: "waiting-game", keep: "slow-walk" };

	it("leaves longer slugs and plain words in prose alone", () => {
		const text =
			'---\nslug: waiting-game--deadline\nmechanism: "waiting-game"\n---\n\nThe "waiting-game" and waiting-games, see /read/toolkit/waiting-game--deadline.\n';
		expect(rebindContent(text, rebind)).toBe(
			'---\nslug: waiting-game--deadline\nmechanism: "slow-walk"\n---\n\nThe "waiting-game" and waiting-games, see /read/toolkit/waiting-game--deadline.\n',
		);
	});

	it("does not rebind a chapter's own slug or its prerequisites", () => {
		const text =
			"---\nslug: waiting-game\nprerequisites:\n  - waiting-game\nmechanisms:\n  - waiting-game\n---\n";
		expect(rebindContent(text, rebind)).toBe(
			"---\nslug: waiting-game\nprerequisites:\n  - waiting-game\nmechanisms:\n  - slow-walk\n---\n",
		);
	});

	it("rebinds slug strings in code, and links built from a route", () => {
		// Source text that builds a link with a template literal.
		const route = (slug: string) =>
			`const href = \`\${readRoutes.mechanisms}/${slug}\`;\nconst slug = '${slug}';\n`;
		expect(rebindCode(route("waiting-game"), rebind)).toBe(route("slow-walk"));
	});
});
