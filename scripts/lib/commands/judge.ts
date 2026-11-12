import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { listBookDirs, repoRoot, slugify } from "../../_lib";
import {
	booksWithMechanism,
	findSimilarMechanisms,
	findSimilarMechanismsByMeaning,
	WORDING_MATCH_MIN,
} from "../authoring";
import { didYouMean } from "../cli";
import { callsFor, readJudgments } from "../corpus-judgments";
import { addDistinctRuling, findRuling } from "../corpus-rulings";
import { corpusScope, pairCorpus, readCorpusBooks } from "../corpus-scope";
import { resolveFromCaller } from "../folder-report";
import {
	JUDGE_COMMAND_ENV,
	runJudges,
	unansweredJudges,
} from "../judge-runner";
import { loadBookContent } from "../load-book";
import { commandsFrom, freshPath } from "../model-command";
import { args, books, runScript } from "./context";

/**
 * Whether two mechanisms are one idea: `bookkit similar`, `judge`, and
 * `rule`.
 */

/**
 * `similar "<title>" [--definition "…"] [--semantic] [--json]`: existing
 * mechanisms a new one might duplicate.
 */
export async function similarCommand() {
	// Read-only twin of `new mechanism`'s first step, for agents and the MCP tool.
	const positional = args.slice(1).filter((arg) => !arg.startsWith("--"));
	const definitionIndex = args.indexOf("--definition");
	const definition =
		definitionIndex >= 0 ? args[definitionIndex + 1] : undefined;
	const title = positional.find((arg) => arg !== definition);
	if (!title) {
		console.error(
			'Usage: bun run bookkit similar "<title>" [--definition "<one sentence>"] [--semantic] [--json]',
		);
		process.exit(1);
	}
	const slug = slugify(title);
	// --semantic ranks by meaning with check:corpus's model; it falls back
	// to wording when the model cannot load.
	const byMeaning = args.includes("--semantic")
		? await findSimilarMechanismsByMeaning({ title, definition }, books, 5)
		: null;
	const semantic = byMeaning && "matches" in byMeaning ? byMeaning : null;
	const result = {
		title,
		slug,
		existingSlug: booksWithMechanism(slug).map((holder) => holder.book),
		method: semantic ? "meaning" : "wording",
		model: semantic?.model,
		note:
			byMeaning && "error" in byMeaning
				? `Ranked by wording; the model did not load: ${byMeaning.error}`
				: undefined,
		// By wording, a match on a word or two is noise; leave those out.
		similar:
			semantic?.matches ??
			findSimilarMechanisms({ title, definition }, books, 5).filter(
				(match) => match.score >= WORDING_MATCH_MIN,
			),
	};
	if (args.includes("--json")) {
		console.log(JSON.stringify(result, null, 2));
	} else if (result.existingSlug.length > 0) {
		console.log(
			`"${slug}" already exists in ${result.existingSlug.join(", ")}.`,
		);
	} else if (result.similar.length === 0) {
		console.log(
			`No existing mechanism shares enough wording with "${title}" to be the same idea.`,
		);
	} else {
		if (result.note) console.log(result.note);
		console.log(`Closest by ${result.method}:`);
		for (const match of result.similar) {
			const detail = semantic
				? `similarity ${match.score.toFixed(2)}`
				: `shares: ${match.sharedWords.join(", ")}`;
			console.log(
				`  ${match.slug}  "${match.title}"  in ${match.books.join(", ")}  (${detail})`,
			);
		}
	}
	process.exit(0);
}

/** Where `bookkit judge` writes requests: per-author state, gitignored. */
function judgingDir(): string {
	return join(repoRoot(), ".bookkit", "judging");
}

/** Request folders, newest first (by key.json's time). */
function requestFolders(): string[] {
	const root = judgingDir();
	return existsSync(root)
		? readdirSync(root)
				.map((name) => join(root, name))
				.filter((folder) => existsSync(join(folder, "key.json")))
				.sort(
					(a, b) =>
						statSync(join(b, "key.json")).mtimeMs -
						statSync(join(a, "key.json")).mtimeMs,
				)
		: [];
}

/** The newest request folder that has answers in it. */
function newestAnswered(): { folder: string } | { error: string } {
	const requests = requestFolders();
	const answered = requests.find((folder) =>
		readdirSync(folder).some((file) => /^answer.*\.json$/i.test(file)),
	);
	if (answered) return { folder: answered };
	return {
		error:
			requests.length === 0
				? "No judging requests yet. Start one with bun run bookkit judge [mechanism]."
				: `No answers yet in ${requests[0]}. Save judge n's reply there as answer-<n>.json, then run this again.`,
	};
}

/**
 * The judge commands: every --run, else the environment's, one per line,
 * unless --no-run. With several, judge n is asked with the nth, in turn.
 */
function judgeCommands(rest: string[]): string[] {
	if (rest.includes("--no-run")) return [];
	return commandsFrom(rest, "--run", JUDGE_COMMAND_ENV);
}

/** How to have bookkit ask the judges itself. */
function judgeCommandHint(): string {
	return `To have bookkit ask them and record the answers: set ${JUDGE_COMMAND_ENV} to a command that reads a prompt on stdin and prints the reply (an LLM's command-line tool), or pass --run "<command>". Several commands (one per line, or --run more than once) ask the judges in turn, so a panel can mix models.`;
}

/**
 * Asks the judges in `folder` that have not answered, with `command`, then
 * records the answers once every judge has one.
 */
async function askAndRecord(
	folder: string,
	commands: string[],
): Promise<number> {
	const waiting = unansweredJudges(folder);
	if (waiting.length > 0) {
		console.log(
			commands.length === 1
				? `\nAsking ${waiting.length} judge(s), each on its own, with: ${commands[0]}`
				: `\nAsking ${waiting.length} judge(s), each on its own, with ${commands.length} commands in turn: ${commands.join("; ")}`,
		);
		const results = await runJudges(folder, commands);
		for (const result of results) {
			const asked = commands.length > 1 ? `${result.command}, ` : "";
			console.log(
				result.answer
					? `  ✓ judge ${result.judge} (${asked}${result.seconds}s)`
					: `  ✗ judge ${result.judge} (${asked}${result.seconds}s): ${result.error}`,
			);
		}
		if (results.some((result) => !result.answer)) {
			console.log(
				`\nNot recorded: every judge needs an answer. Ask the rest again: bun run bookkit judge run ${relative(process.cwd(), folder) || "."}\n(or save a judge's reply by hand as answer-<n>.json in that folder).`,
			);
			return 1;
		}
	}
	console.log("");
	return runScript("check-corpus.ts", ["--judge-record", folder]);
}

/**
 * bookkit judge [slug]: a blind request for judges (check:corpus
 * --judge-prompt), in a fresh folder under .bookkit/judging/; with a judge
 * command, it asks them and records the answers too. bookkit judge run
 * [folder]: asks the judges that have not answered. bookkit judge record
 * [folder]: reads the answers back (--judge-record).
 */
export async function judge(rest: string[]): Promise<number> {
	if (rest[0] === "record" || rest[0] === "run") {
		const named =
			rest[1] && !rest[1].startsWith("--")
				? resolveFromCaller(rest[1])
				: undefined;
		if (rest[0] === "run") {
			const commands = judgeCommands(rest);
			if (commands.length === 0) {
				console.error(`No judge command. ${judgeCommandHint()}`);
				return 1;
			}
			const folder = named ?? requestFolders()[0];
			if (!folder) {
				console.error(
					"No judging requests yet. Start one with bun run bookkit judge [mechanism].",
				);
				return 1;
			}
			return askAndRecord(folder, commands);
		}
		const found = named ? { folder: named } : newestAnswered();
		if ("error" in found) {
			console.error(found.error);
			return 1;
		}
		return runScript("check-corpus.ts", ["--judge-record", found.folder]);
	}
	const slug = rest[0] && !rest[0].startsWith("--") ? rest[0] : undefined;
	const rulings = rest.includes("--rulings");
	if (rulings && slug) {
		console.error(
			"bookkit judge --rulings asks about every ruled pair; leave out the mechanism.",
		);
		return 1;
	}
	const passed = (name: string) => {
		const index = rest.indexOf(name);
		return index >= 0 && rest[index + 1] ? [name, rest[index + 1]] : [];
	};
	const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
	const name = slug ?? (rulings ? "rulings" : "corpus");
	const folder = freshPath(join(judgingDir(), `${name}-${stamp}`));
	const commands = judgeCommands(rest);
	const status = runScript("check-corpus.ts", [
		"--judge-prompt",
		folder,
		...(slug ? ["--judge-for", slug] : []),
		// The ruled pairs need no ranking, so no model.
		...(rulings ? ["--judge-rulings", "--no-semantic"] : []),
		...passed("--judge-top"),
		...passed("--judges"),
		...(rest.includes("--quick") && !rulings ? ["--no-semantic"] : []),
		...(rest.includes("--download-model") ? ["--download-model"] : []),
		...(commands.length > 0 ? ["--asked-by", commands.join("; ")] : []),
	]);
	// Nothing to judge writes no request.
	if (status !== 0 || !existsSync(join(folder, "key.json"))) return status;
	if (commands.length === 0) {
		console.log(`\n${judgeCommandHint()}`);
		return 0;
	}
	return askAndRecord(folder, commands);
}

/**
 * bookkit rule <a> <b> --distinct "<reason>": the author's ruling that two
 * mechanisms in the shared corpus are different ideas, added to corpus.json.
 * The other ruling, one idea, is bookkit merge.
 */
export function rule(rest: string[]): number {
	const usage =
		'bun run bookkit rule <mechanism> <mechanism> --distinct "<reason>"';
	if (rest.includes("--same") || rest.includes("--merge")) {
		console.error(
			'bookkit rule records distinct rulings. For one idea: bun run bookkit merge <keep> <drop> --reason "<why they are one idea>".',
		);
		return 1;
	}
	const reasonIndex = rest.indexOf("--distinct");
	const reason = reasonIndex >= 0 ? rest[reasonIndex + 1] : undefined;
	const [a, b] = rest.filter(
		(arg, index) => !arg.startsWith("--") && index !== reasonIndex + 1,
	);
	if (!a || !b || reasonIndex < 0) {
		console.error(`Usage: ${usage}`);
		return 1;
	}
	if (a === b) {
		console.error(`Name two different mechanisms; got ${a} twice.`);
		return 1;
	}
	// A ruling settles a pair within one corpus: the shared one (corpus.json
	// "books"), or a book outside it, which check:corpus checks on its own.
	const books = listBookDirs();
	const scope = corpusScope(books, readCorpusBooks());
	const loaded = books.flatMap((book) =>
		loadBookContent(book).mechanisms.map((m) => ({ ...m, book })),
	);
	const slugs = [...new Set(loaded.map((m) => m.slug))];
	for (const slug of [a, b]) {
		if (slugs.includes(slug)) continue;
		console.error(`No mechanism ${slug}.${didYouMean(slug, slugs)}`);
		return 1;
	}
	const found = pairCorpus(a, b, loaded, scope);
	if ("where" in found) {
		console.error(
			`${a} (${found.where[0]}) and ${b} (${found.where[1]}) are in different corpora, where similar mechanisms are allowed, so there is nothing to rule. To hold two books to one vocabulary, list both in "books" in corpus.json.`,
		);
		return 1;
	}
	const { corpus } = found;
	const shared = loaded.filter((m) => scope.corpusOf(m.book) === corpus);
	const corpusPath = join(repoRoot(), "corpus.json");
	const text = existsSync(corpusPath) ? readFileSync(corpusPath, "utf8") : null;
	let distinct: Array<{ pair: [string, string]; reason: string }> = [];
	try {
		distinct = text ? (JSON.parse(text).distinct ?? []) : [];
	} catch (error) {
		console.error(
			`corpus.json is not valid JSON (${error instanceof Error ? error.message : String(error)}). Fix it first.`,
		);
		return 1;
	}
	const existing = findRuling(distinct, a, b);
	if (existing) {
		console.error(
			`${a} ~ ${b} is already ruled distinct: ${existing.reason}\nTo change the ruling, edit it in corpus.json.`,
		);
		return 1;
	}
	const read = readJudgments(repoRoot());
	const call =
		"error" in read
			? undefined
			: callsFor(a, read.records, shared).find(({ other }) => other === b)
					?.call;
	if (!reason?.trim() || reason.startsWith("--")) {
		console.error(
			"--distinct needs the reason, in your words: what each one's lever is, so a reader can tell them apart.",
		);
		if (call?.call === "distinct") {
			console.error(`  The judges' draft: ${call.draft}`);
		}
		console.error(`Usage: ${usage}`);
		return 1;
	}
	writeFileSync(
		corpusPath,
		addDistinctRuling(text, { pair: [a, b], reason: reason.trim() }),
	);
	console.log(`Ruled ${a} ~ ${b} distinct in corpus.json.`);
	if (call && call.call !== "distinct") {
		console.log(
			"  The judges called them the same idea, or split; your ruling stands over theirs.",
		);
	}
	console.log(
		"Next: bun run bookkit check no longer flags the pair. Commit corpus.json with the chapters it concerns.",
	);
	return 0;
}
