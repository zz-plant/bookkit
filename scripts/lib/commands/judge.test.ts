import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
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
import { repoRoot } from "../../_lib";
import { runChild, waitForChildren } from "../child-process.fixture";
import { formatJson, type JudgmentRecord } from "../corpus-judgments";

/**
 * `bookkit judge` and `bookkit rule`, in a workspace of their own: a request
 * written for the judges and their answers recorded, a judge command asked
 * for them, and a pair ruled distinct in corpus.json. check:corpus with the
 * verdicts they record is in scripts/corpus-judgments.test.ts.
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

waitForChildren();

const writeRecords = (records: unknown[]) =>
	writeFileSync(
		join(workspace, "corpus-judgments.json"),
		formatJson({ judgments: records }),
	);

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-judge-"));
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

describe("bookkit judge and bookkit rule", () => {
	const bookkit = (...args: string[]) =>
		runChild(
			[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
			{
				cwd: workspace,
				env: {
					...process.env,
					BOOKKIT_MODEL_CACHE: join(workspace, "no-model"),
				},
			},
		);
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
			`bun run bookkit merge ${entry.pair[0]} ${entry.pair[1]} --reason "<why>"`,
		);
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

describe("bookkit judge with a judge command", () => {
	// A judge that answers every pair in its prompt, and fails if it can see
	// anything but its prompt.
	const FAKE_JUDGE = `import { readdirSync } from "node:fs";
const prompt = await Bun.stdin.text();
const seen = readdirSync(".").join(",");
if (seen !== "prompt.md" || !process.env.BOOKKIT_JUDGE_PROMPT) {
	console.error(\`not blind: \${seen}\`);
	process.exit(2);
}
const pairs = JSON.parse(prompt.slice(prompt.indexOf("The pairs:") + 10));
console.log(JSON.stringify(pairs.map((pair) => ({
	id: pair.id, same_lever: 0.2, same_evidence: 0.1, relation: "same_family", relation_p: 0.6,
}))));
`;
	const judgeCommand = () => {
		const path = join(workspace, "fake-judge.ts");
		writeFileSync(path, FAKE_JUDGE);
		return `'${process.execPath}' '${path}'`;
	};
	const bookkit = (env: Record<string, string>, ...args: string[]) =>
		runChild(
			[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
			{
				cwd: workspace,
				env: {
					...process.env,
					BOOKKIT_MODEL_CACHE: join(workspace, "no-model"),
					BOOKKIT_JUDGE_COMMAND: "",
					...env,
				},
			},
		);
	const judging = () => join(workspace, ".bookkit", "judging");
	const saved = () =>
		JSON.parse(readFileSync(join(workspace, "corpus-judgments.json"), "utf8"))
			.judgments as JudgmentRecord[];

	it("asks each judge with --run, each alone, and records the answers", () => {
		writeRecords([]);
		rmSync(judging(), { recursive: true, force: true });
		const asked = bookkit(
			{},
			"judge",
			"waiting-game",
			"--judge-top",
			"1",
			"--run",
			judgeCommand(),
		);
		expect(asked.output).toContain("Asking 3 judge(s), each on its own");
		expect(asked.output).not.toContain("Save judge n's reply");
		expect(asked.output).toContain("✓ judge 3");
		expect(asked.output).toContain("Recorded 3 judge(s) on 1 pair(s)");
		expect(asked.status).toBe(0);
		expect(saved()[0].votes).toHaveLength(3);
	});

	it("asks a panel of commands in turn and records which command gave each vote", () => {
		writeRecords([]);
		rmSync(judging(), { recursive: true, force: true });
		const first = judgeCommand();
		const second = `${first} --second`;
		const asked = bookkit(
			{},
			"judge",
			"waiting-game",
			"--judge-top",
			"1",
			"--run",
			`JUDGE_KEY=secret ${first}`,
			"--run",
			second,
		);
		expect(asked.output).toContain("with 2 commands in turn");
		expect(asked.status).toBe(0);
		const votes = saved()[0].votes;
		expect(votes.map((vote) => vote.command)).toEqual([first, second, first]);
		expect(JSON.stringify(saved())).not.toContain("secret");
	});

	it("keeps a failed judge's output, records nothing, and asks again with judge run", () => {
		writeRecords([]);
		rmSync(judging(), { recursive: true, force: true });
		const failed = bookkit(
			{ BOOKKIT_JUDGE_COMMAND: "echo 'no idea'" },
			"judge",
			"waiting-game",
			"--judge-top",
			"1",
		);
		expect(failed.status).toBe(1);
		expect(failed.output).toContain("✗ judge 1");
		expect(failed.output).toContain("holds no JSON array of answers");
		expect(failed.output).toContain("Not recorded");
		expect(failed.output).toContain("bun run bookkit judge run");
		const [request] = readdirSync(judging());
		expect(
			readFileSync(join(judging(), request, "judge-1", "reply.txt"), "utf8"),
		).toBe("no idea\n");
		expect(saved()).toEqual([]);

		expect(bookkit({}, "judge", "run").output).toContain(
			"No judge command. To have bookkit ask them",
		);
		const again = bookkit(
			{ BOOKKIT_JUDGE_COMMAND: judgeCommand() },
			"judge",
			"run",
		);
		expect(again.status).toBe(0);
		expect(again.output).toContain("Recorded 3 judge(s) on 1 pair(s)");
	});

	it("without a judge command, writes the prompts and says how to have them asked", () => {
		rmSync(judging(), { recursive: true, force: true });
		writeRecords([]);
		const asked = bookkit({}, "judge", "waiting-game", "--judge-top", "1");
		expect(asked.status).toBe(0);
		expect(asked.output).toContain("Save judge n's reply");
		expect(asked.output).toContain(
			"set BOOKKIT_JUDGE_COMMAND to a command that reads a prompt on stdin",
		);
	});
});
