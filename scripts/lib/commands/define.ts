import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseFrontmatter } from "../../../packages/astro-bookkit/src/utils/frontmatter";
import { candidateCheckContext } from "../../../packages/astro-bookkit/src/validators/book-validator";
import { checkContentItem } from "../../../packages/astro-bookkit/src/validators/content-check";
import { listBookDirs, repoRoot } from "../../_lib";
import {
	findSimilarMechanisms,
	loadBookConfig,
	WORDING_MATCH_MIN,
} from "../authoring";
import { didYouMean, positionals } from "../cli";
import { WRITER_COMMAND_ENV } from "../draft-run";
import { loadBookContent } from "../load-book";
import {
	definePrompt,
	emptyFields,
	evidenceFor,
	fillMechanism,
	readDefinition,
} from "../mechanism-define";
import { askCommand, commandLabel, commandsFrom } from "../model-command";
import { takeBook } from "./context";

/**
 * `bookkit define [book] <mechanism>`: a writer model drafts the empty
 * fields of a mechanism from the sentences of the book that use it
 * (mechanism-define.ts). It is shown, never written, unless --apply is
 * given, the content check passes, and no mechanism in any book reads
 * like the same idea by wording.
 */

const USAGE =
	'bun run bookkit define [book] <mechanism> [--writer "<command>"] [--apply] [--no-run]';

/**
 * A wording score at or above this is a definition that reads like an
 * existing mechanism: closer than the hint `similar` shows (0.3), and
 * close enough that writing it would grow the vocabulary by a synonym.
 */
export const DEFINE_OVERLAP_MAX = 0.5;

const shown = (path: string): string => relative(process.cwd(), path) || ".";

export async function define(rest: string[]): Promise<number> {
	const [book, [slug]] = takeBook(positionals(rest, ["--writer"]), 1, USAGE);
	if (!slug) {
		console.error(`Usage: ${USAGE}`);
		return 1;
	}
	const content = loadBookContent(book);
	const mechanism = content.mechanisms.find((m) => m.slug === slug);
	const file = join(content.bookRoot, "mechanisms", `${slug}.mdx`);
	if (!mechanism || !existsSync(file)) {
		console.error(
			`${book} has no mechanism "${slug}".${didYouMean(
				slug,
				content.mechanisms.map((m) => m.slug),
			)}`,
		);
		return 1;
	}
	const source = readFileSync(file, "utf8");
	const empty = emptyFields(source);
	if (empty.length === 0 || !empty.includes("definition")) {
		console.error(
			`${shown(file)} already has a definition, so there is nothing for a writer to define. Its fields are yours: bun run bookkit check ${shown(file)} says what each still needs.`,
		);
		return 1;
	}
	const config = (await loadBookConfig(book)) ?? {};
	const evidence = evidenceFor(mechanism, content.chapterBodies);
	const prompt = definePrompt({
		bookTitle: typeof config.title === "string" ? config.title : book,
		stance:
			typeof config.causalStance === "string" ? config.causalStance : undefined,
		mechanism,
		evidence,
		others: content.mechanisms
			.filter((m) => m.slug !== slug && m.definition)
			.map(({ slug: other, title, definition }) => ({
				slug: other,
				title,
				definition,
			})),
	});
	const folder = join(repoRoot(), ".bookkit", "defining", `${book}-${slug}`);
	mkdirSync(folder, { recursive: true });
	writeFileSync(join(folder, "prompt.md"), prompt);
	const proposedPath = join(folder, "proposed.mdx");
	const basePath = join(folder, "base.mdx");
	// --apply writes the proposal already shown, while the file is as it was.
	const saved =
		rest.includes("--apply") &&
		existsSync(proposedPath) &&
		existsSync(basePath) &&
		readFileSync(basePath, "utf8") === source;
	const commands =
		saved || rest.includes("--no-run")
			? []
			: commandsFrom(rest, "--writer", WRITER_COMMAND_ENV);
	console.log(
		`\n${shown(file)}: ${evidence.length} sentence(s) of the book use "${mechanism.title}"; empty: ${empty.join(", ")}.`,
	);
	let filled: string;
	if (saved) {
		filled = readFileSync(proposedPath, "utf8");
		console.log(`  Writing the proposal in ${shown(proposedPath)}.`);
	} else {
		if (commands.length === 0) {
			console.log(
				`  The writer's prompt is ${shown(join(folder, "prompt.md"))}. Give it to a model, or set ${WRITER_COMMAND_ENV} or pass --writer "<command>".`,
			);
			return 0;
		}
		const asked = await askCommand(
			commands[0],
			prompt,
			"BOOKKIT_DEFINE_PROMPT",
		);
		writeFileSync(join(folder, "reply.txt"), asked.output);
		const fields = asked.error
			? { error: asked.error }
			: readDefinition(asked.reply);
		if ("error" in fields) {
			console.error(
				`  ✗ ${commandLabel(commands[0])} (${asked.seconds}s): ${fields.error} (reply in ${shown(join(folder, "reply.txt"))})`,
			);
			return 1;
		}
		filled = fillMechanism(source, fields).source;
		writeFileSync(proposedPath, filled);
		writeFileSync(basePath, source);
		console.log(`  ✓ ${commandLabel(commands[0])} (${asked.seconds}s)`);
	}
	const proposal = parseFrontmatter(filled);
	const data = proposal.status === "ok" ? proposal.data : {};
	const written = empty.filter((field) => {
		const value = data[field];
		return Array.isArray(value) ? value.length > 0 : Boolean(value);
	});
	const definition = typeof data.definition === "string" ? data.definition : "";
	console.log(`\n  definition: ${definition}`);
	for (const [label, field] of [
		["is", "is"],
		["is not", "isNot"],
		["predictions", "predictions"],
		["tests", "tests"],
	] as const) {
		const items = Array.isArray(data[field]) ? (data[field] as string[]) : [];
		if (items.length > 0 && written.includes(field)) {
			console.log(
				`  ${label}:\n${items.map((item) => `    - ${item}`).join("\n")}`,
			);
		}
	}
	// What decides: the compiler, then overlap with every book's mechanisms.
	const checked = checkContentItem(
		"mechanism",
		filled,
		candidateCheckContext(repoRoot(), book).context,
	);
	const errors = checked.findings.filter(
		(finding) => finding.level === "error",
	);
	const near = findSimilarMechanisms(
		{ title: mechanism.title, definition },
		listBookDirs(),
		4,
	).filter((match) => match.slug !== slug);
	const overlap = near.find((match) => match.score >= DEFINE_OVERLAP_MAX);
	console.log("");
	for (const match of near.filter((m) => m.score >= WORDING_MATCH_MIN)) {
		console.log(
			`  near ${match.title} (\`${match.slug}\`, ${match.books.join(", ")}): ${match.score} by wording`,
		);
	}
	if (errors.length > 0) {
		console.log(
			`  Not written: the check finds ${errors.length} error(s):\n${errors.map((finding) => `    ${finding.message}`).join("\n")}`,
		);
		return 1;
	}
	if (overlap) {
		console.log(
			`  Not written: it reads like ${overlap.title} (\`${overlap.slug}\`), at ${overlap.score} by wording. If they are one idea, merge them (bun run bookkit merge); if not, write the boundary yourself and ask judges: bun run bookkit judge ${slug}.`,
		);
		return 1;
	}
	if (!rest.includes("--apply")) {
		console.log(
			`  It passes the check and overlaps no mechanism. Write it into ${shown(file)} (only the empty fields: ${written.join(", ")}):\n    bun run bookkit define ${book} ${slug} --apply\n  The proposal is also in ${shown(join(folder, "proposed.mdx"))}.`,
		);
		return 0;
	}
	// The file may have changed while the writer worked.
	if (readFileSync(file, "utf8") !== source) {
		console.error(
			`  Not written: ${shown(file)} changed while the writer worked. Run it again.`,
		);
		return 1;
	}
	writeFileSync(file, filled);
	console.log(
		`  Wrote ${written.join(", ")} into ${shown(file)}${data.status === "draft" ? ", still a draft" : ""}. Read it as yours before you publish it.`,
	);
	return 0;
}
