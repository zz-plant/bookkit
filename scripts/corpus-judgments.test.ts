import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";
import {
	formatJson,
	type JudgmentRecord,
	matchJudgments,
	mergeRecords,
	textHash,
} from "./lib/corpus-judgments";

/**
 * check:corpus with judges' verdicts, in a workspace of its own: a pair the
 * judges called the same idea is flagged though its wording differs, a
 * verdict on a text that changed stops applying, and --judge-prompt then
 * --judge-record round-trips answers into corpus-judgments.json.
 */

let workspace: string;

const MECHANISMS = {
	"waiting-game": {
		title: "Waiting game",
		definition: "Stalling until the other side gives up.",
	},
	"slow-walk": {
		title: "Slow walk",
		definition: "Processing a request at a crawl on purpose.",
	},
	"tidy-desk": {
		title: "Tidy desk",
		definition: "Filing every record by colour.",
	},
} as const;

const source = (slug: keyof typeof MECHANISMS) => `---
slug: ${slug}
title: "${MECHANISMS[slug].title}"
definition: "${MECHANISMS[slug].definition}"
---
`;

const text = (slug: keyof typeof MECHANISMS) => ({
	slug,
	title: MECHANISMS[slug].title,
	definition: MECHANISMS[slug].definition,
	is: [],
});

const vote = (relation: string, judge = "test judge") => ({
	judge,
	date: "2026-10-14",
	relation,
	sameLever: 0.8,
	sameEvidence: 0.7,
});

const checkCorpus = (...args: string[]) => {
	const result = Bun.spawnSync(
		[
			process.execPath,
			join(repoRoot(), "scripts", "check-corpus.ts"),
			"--no-semantic",
			...args,
		],
		{ cwd: workspace, stdout: "pipe", stderr: "pipe" },
	);
	return {
		status: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
};

const writeRecords = (records: unknown[]) =>
	writeFileSync(
		join(workspace, "corpus-judgments.json"),
		formatJson({ judgments: records }),
	);

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-judgments-"));
	// bookkit runs its helper scripts from the workspace's scripts/.
	mkdirSync(join(workspace, "scripts"));
	for (const entry of readdirSync(join(repoRoot(), "scripts"))) {
		symlinkSync(
			join(repoRoot(), "scripts", entry),
			join(workspace, "scripts", entry),
		);
	}
	writeFileSync(
		join(workspace, "corpus.json"),
		JSON.stringify({ books: ["one", "two"], distinct: [] }),
	);
	for (const [book, slugs] of [
		["one", ["waiting-game"]],
		["two", ["slow-walk", "tidy-desk"]],
	] as const) {
		const dir = join(workspace, "apps", book, "src/content/book/mechanisms");
		mkdirSync(dir, { recursive: true });
		for (const slug of slugs) {
			writeFileSync(join(dir, `${slug}.mdx`), source(slug));
		}
	}
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("check:corpus with judges' verdicts", () => {
	it("passes with no verdicts: the wording alone flags nothing here", () => {
		const result = checkCorpus("--mode", "error");
		expect(result.output).toContain("No unresolved overlapping mechanisms.");
		expect(result.status).toBe(0);
	});

	it("flags a pair every judge called the same idea, with the call and what to do", () => {
		writeRecords([
			{
				pair: ["waiting-game", "slow-walk"],
				texts: [textHash(text("waiting-game")), textHash(text("slow-walk"))],
				votes: [vote("same_idea", "a"), vote("same_idea", "b")],
			},
		]);
		const result = checkCorpus("--mode", "error");
		expect(result.output).toContain(
			"judges: verdicts on 1 pair(s) in corpus-judgments.json",
		);
		expect(result.output).toContain("judged the same idea");
		expect(result.output).toContain(
			"waiting-game ~ slow-walk: judges: same idea, 2 of 2",
		);
		expect(result.output).toContain("likely one mechanism");
		expect(result.status).toBe(1);
	});

	it("drops a verdict once either text changes, and says which pair to ask about again", () => {
		writeRecords([
			{
				pair: ["waiting-game", "slow-walk"],
				texts: [textHash(text("waiting-game")), "0000000000000000"],
				votes: [vote("same_idea")],
			},
		]);
		const result = checkCorpus("--mode", "error");
		expect(result.output).toContain(
			"1 changed since judged (waiting-game ~ slow-walk)",
		);
		expect(result.status).toBe(0);
	});

	it("writes a blind request, then records the answers", () => {
		writeRecords([]);
		const dir = join(workspace, "judging");
		const prompt = checkCorpus("--judge-prompt", dir, "--judge-top", "3");
		expect(prompt.status).toBe(0);
		expect(prompt.output).toContain("Wrote 3 pair(s) to judge");
		const pairsOf = (judge: number) =>
			JSON.parse(
				readFileSync(join(dir, `judge-${judge}`, "pairs.json"), "utf8"),
			) as Array<{ id: string }>;
		const pairs = pairsOf(1);
		expect(pairs).toHaveLength(3);
		// Each judge gets the same pairs, under the same ids.
		for (const judge of [2, 3]) {
			expect(
				pairsOf(judge)
					.map((pair) => pair.id)
					.sort(),
			).toEqual(pairs.map((pair) => pair.id).sort());
		}
		// Blind: the judge sees titles and definitions, not slugs or books.
		const visible = readFileSync(join(dir, "judge-1", "pairs.json"), "utf8");
		expect(visible).not.toContain("waiting-game");
		expect(visible).not.toContain('"two"');
		// Each prompt names its own pairs file, so it can be handed over alone.
		const prompt2 = readFileSync(join(dir, "judge-2", "prompt.md"), "utf8");
		expect(prompt2).toContain("holds 3 pairs");
		expect(prompt2).toContain(join(dir, "judge-2", "pairs.json"));

		const answers = (relation: string) =>
			JSON.stringify(
				pairs.map((pair: { id: string }) => ({
					id: pair.id,
					same_lever: 0.2,
					same_evidence: 0.1,
					relation,
					relation_p: 0.6,
				})),
			);
		// Prose around the array is fine: it is what a chat reply looks like.
		writeFileSync(
			join(dir, "answer-1.json"),
			`Here you go:\n${answers("same_family")}`,
		);
		writeFileSync(join(dir, "answer-2.json"), answers("unrelated"));
		const record = checkCorpus("--judge-record", dir);
		expect(record.status).toBe(0);
		expect(record.output).toContain("Recorded 2 judge(s) on 3 pair(s)");
		const saved = JSON.parse(
			readFileSync(join(workspace, "corpus-judgments.json"), "utf8"),
		).judgments as JudgmentRecord[];
		expect(saved).toHaveLength(3);
		expect(saved.every((r) => r.votes.length === 2)).toBe(true);

		// Recording the same answers again adds nothing.
		checkCorpus("--judge-record", dir);
		const again = JSON.parse(
			readFileSync(join(workspace, "corpus-judgments.json"), "utf8"),
		).judgments as JudgmentRecord[];
		expect(again.every((r) => r.votes.length === 2)).toBe(true);

		// Every pair is judged now, so nothing is left to ask about.
		const none = checkCorpus("--judge-prompt", join(workspace, "next"));
		expect(none.output).toContain("Nothing to judge");
		expect(existsSync(join(workspace, "next"))).toBe(false);
	});

	it("refuses an answer file that skips a pair or invents a relation", () => {
		const dir = join(workspace, "judging");
		writeFileSync(
			join(dir, "answer-1.json"),
			'[{"id":"P01","same_lever":0.2,"same_evidence":0.1,"relation":"cousins"}]',
		);
		const result = checkCorpus("--judge-record", dir);
		expect(result.status).toBe(1);
		expect(result.output).toContain("a relation from same_idea");
	});
});

describe("judging one mechanism at a time", () => {
	const bookkitCheck = (file: string, ...flags: string[]) => {
		const result = Bun.spawnSync(
			[
				process.execPath,
				join(repoRoot(), "scripts", "bookkit.ts"),
				"check",
				file,
				...flags,
			],
			{
				cwd: workspace,
				// No model and no stored vectors: nearest by wording, on any machine.
				env: {
					...process.env,
					BOOKKIT_MODEL_CACHE: join(workspace, "no-model"),
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		return `${result.stdout.toString()}${result.stderr.toString()}`;
	};
	const waitingGame = "apps/one/src/content/book/mechanisms/waiting-game.mdx";

	it("--judge-for asks only about that mechanism's nearest pairs", () => {
		writeRecords([]);
		const dir = join(workspace, "one-mechanism");
		const result = checkCorpus(
			"--judge-prompt",
			dir,
			"--judge-for",
			"tidy-desk",
			"--judge-top",
			"1",
		);
		expect(result.status).toBe(0);
		const key = JSON.parse(readFileSync(join(dir, "key.json"), "utf8"));
		expect(key).toHaveLength(1);
		expect(key[0].pair).toContain("tidy-desk");
		expect(
			checkCorpus("--judge-prompt", dir, "--judge-for", "tidy-dsk").output,
		).toContain("Did you mean tidy-desk?");
	});

	it("bookkit check on a mechanism says when its closest pairs have no verdict", () => {
		writeRecords([]);
		expect(bookkitCheck(waitingGame)).toContain(
			"Ask: bun run bookkit judge waiting-game",
		);
	});

	it("bookkit check on a mechanism names the one the judges call the same idea", () => {
		writeRecords([
			{
				pair: ["waiting-game", "slow-walk"],
				texts: [textHash(text("waiting-game")), textHash(text("slow-walk"))],
				votes: [vote("same_idea", "a"), vote("same_idea", "b")],
			},
		]);
		expect(bookkitCheck(waitingGame)).toContain(
			"judges: the same idea as slow-walk (2 of 2). Bind slow-walk instead",
		);
	});

	it("bookkit check names a near mechanism with no verdict, though another pair has one", () => {
		// tidy-desk shares no wording with waiting-game, so no wording match
		// lists it; it is still among the three nearest, and unjudged.
		writeRecords([
			{
				pair: ["waiting-game", "slow-walk"],
				texts: [textHash(text("waiting-game")), textHash(text("slow-walk"))],
				votes: [vote("same_family")],
			},
		]);
		const output = bookkitCheck(waitingGame);
		expect(output).toContain("Ask: bun run bookkit judge waiting-game");
		const json = JSON.parse(bookkitCheck(`${waitingGame}`, "--json"));
		expect(json.judged.unasked).toEqual(["tidy-desk"]);
		expect(json.judged.nearestBy).toBe("wording");
	});
});

describe("bookkit judge and bookkit rule", () => {
	const bookkit = (...args: string[]) => {
		const result = Bun.spawnSync(
			[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
			{
				cwd: workspace,
				env: {
					...process.env,
					BOOKKIT_MODEL_CACHE: join(workspace, "no-model"),
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		return {
			status: result.exitCode,
			output: `${result.stdout.toString()}${result.stderr.toString()}`,
		};
	};
	const judging = () => join(workspace, ".bookkit", "judging");

	it("judge writes a request under .bookkit/judging, and judge record reads the newest answered one", () => {
		writeRecords([]);
		rmSync(judging(), { recursive: true, force: true });
		expect(bookkit("judge", "record").output).toContain(
			"No judging requests yet",
		);
		const asked = bookkit("judge", "waiting-game", "--judge-top", "1");
		expect(asked.status).toBe(0);
		const [request] = readdirSync(judging());
		expect(request).toStartWith("waiting-game-");
		const folder = join(judging(), request);
		expect(asked.output).toContain(join(folder, "judge-3", "prompt.md"));
		expect(asked.output).toContain("then: bun run bookkit judge record");
		expect(bookkit("judge", "record").output).toContain("No answers yet in");

		const [entry] = JSON.parse(readFileSync(join(folder, "key.json"), "utf8"));
		writeFileSync(
			join(folder, "answer-1.json"),
			JSON.stringify([
				{
					id: entry.id,
					same_lever: 0.8,
					same_evidence: 0.8,
					relation: "same_idea",
					relation_p: 0.7,
				},
			]),
		);
		const recorded = bookkit("judge", "record");
		expect(recorded.status).toBe(0);
		expect(recorded.output).toContain("Yours to settle (1)");
		expect(recorded.output).toContain(
			`bun run bookkit rule ${entry.pair[0]} ${entry.pair[1]} --distinct "<reason>"`,
		);
	});

	it("rule writes a distinct ruling to corpus.json, once, with a reason", () => {
		const corpusPath = join(workspace, "corpus.json");
		const before = readFileSync(corpusPath, "utf8");
		expect(
			bookkit("rule", "waiting-game", "slow-walk", "--distinct").output,
		).toContain("--distinct needs the reason");
		expect(
			bookkit("rule", "waiting-game", "slow-wlak", "--distinct", "x").output,
		).toContain("Did you mean slow-walk?");
		const ruled = bookkit(
			"rule",
			"waiting-game",
			"slow-walk",
			"--distinct",
			"Stalling until they quit is not slowing the paperwork.",
		);
		expect(ruled.status).toBe(0);
		expect(ruled.output).toContain("Ruled waiting-game ~ slow-walk distinct");
		expect(JSON.parse(readFileSync(corpusPath, "utf8")).distinct).toEqual([
			{
				pair: ["waiting-game", "slow-walk"],
				reason: "Stalling until they quit is not slowing the paperwork.",
			},
		]);
		const again = bookkit(
			"rule",
			"slow-walk",
			"waiting-game",
			"--distinct",
			"y",
		);
		expect(again.status).toBe(1);
		expect(again.output).toContain("already ruled distinct");
		writeFileSync(corpusPath, before);
	});

	it("rule settles a pair inside a book outside the shared corpus, and refuses a pair across corpora", () => {
		// "three" is not in corpus.json "books": check:corpus checks it on its own.
		const dir = join(workspace, "apps", "three", "src/content/book/mechanisms");
		mkdirSync(dir, { recursive: true });
		const own = (slug: string, definition: string) =>
			writeFileSync(
				join(dir, `${slug}.mdx`),
				`---\nslug: ${slug}\ntitle: "${slug}"\ndefinition: "${definition}"\n---\n`,
			);
		own("queue-reset", "Sending people to the back of the line on any error.");
		own("form-loop", "Asking for the same form again after each reply.");
		const corpusPath = join(workspace, "corpus.json");
		const before = readFileSync(corpusPath, "utf8");
		try {
			const within = bookkit(
				"rule",
				"queue-reset",
				"form-loop",
				"--distinct",
				"Losing your place is not being asked again.",
			);
			expect(within.status).toBe(0);
			const across = bookkit(
				"rule",
				"queue-reset",
				"waiting-game",
				"--distinct",
				"x",
			);
			expect(across.status).toBe(1);
			expect(across.output).toContain("are in different corpora");
		} finally {
			writeFileSync(corpusPath, before);
			rmSync(join(workspace, "apps", "three"), {
				recursive: true,
				force: true,
			});
		}
	});
});

describe("corpus-judgments helpers", () => {
	const record = (
		texts: [string, string],
		judge: string,
		relation = "same_family",
	): JudgmentRecord => ({
		pair: ["waiting-game", "slow-walk"],
		texts,
		votes: [vote(relation, judge) as JudgmentRecord["votes"][number]],
	});
	const now: [string, string] = [
		textHash(text("waiting-game")),
		textHash(text("slow-walk")),
	];

	it("merges votes on the same texts into one record, whichever way the pair was written", () => {
		const reversed: JudgmentRecord = {
			pair: ["slow-walk", "waiting-game"],
			texts: [now[1], now[0]],
			votes: [vote("same_idea", "b") as JudgmentRecord["votes"][number]],
		};
		const merged = mergeRecords([record(now, "a")], [reversed]);
		expect(merged).toHaveLength(1);
		expect(merged[0].votes.map((v) => v.judge)).toEqual(["a", "b"]);
		const matched = matchJudgments(merged, [
			text("waiting-game"),
			text("slow-walk"),
		]);
		expect(matched.current[0].votes).toHaveLength(2);
		expect(matched.changed).toEqual([]);
	});

	it("keeps a verdict on older texts as its own record", () => {
		const merged = mergeRecords(
			[record(["old", "old"], "a")],
			[record(now, "a")],
		);
		expect(merged).toHaveLength(2);
	});

	it("writes JSON the way Biome formats it", () => {
		expect(
			formatJson({
				judgments: [{ pair: ["a", "b"], votes: [{ relation: "same_idea" }] }],
			}),
		).toBe(
			'{\n\t"judgments": [\n\t\t{\n\t\t\t"pair": ["a", "b"],\n\t\t\t"votes": [\n\t\t\t\t{\n\t\t\t\t\t"relation": "same_idea"\n\t\t\t\t}\n\t\t\t]\n\t\t}\n\t]\n}\n',
		);
	});
});
