import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
	type CorpusMechanism,
	corpusEmbeddingText,
	findRecurringTerms,
	type PairCall,
	runBookSuggestions,
} from "../../../packages/astro-bookkit/src/suggestions";
import { listBookDirs, repoRoot } from "../../_lib";
import {
	type ChapterDraft,
	chapterDraft,
	checkContentFile,
	loadBookConfigSummary,
	similarForMechanismFile,
} from "../authoring";
import { compileFinding, compileMdx } from "../compile-mdx";
import { callsFor, nearestTo, readJudgments } from "../corpus-judgments";
import { corpusScope, readCorpusBooks } from "../corpus-scope";
import {
	DEFAULT_EMBEDDING_MODEL_KEY,
	EMBEDDING_MODELS,
	embedTexts,
} from "../embed-text";
import { resolveFromCaller } from "../folder-report";
import { loadBookContent } from "../load-book";
import { checkReleaseNote } from "../release-notes";

/** `bookkit check <file>`: one content file of a book, or one release note. */

/** `check <release note>`: what the release notes page would do wrong with it. */
function checkReleaseFile(path: string, asJson: boolean): number {
	const absolute = resolveFromCaller(path);
	if (!existsSync(absolute)) {
		console.error(`No such file: ${path}`);
		return 1;
	}
	const findings = checkReleaseNote(readFileSync(absolute, "utf8"));
	const shown = relative(repoRoot(), absolute);
	if (asJson) {
		console.log(
			JSON.stringify(
				{ section: "release", file: shown, ok: true, findings },
				null,
				2,
			),
		);
		return 0;
	}
	console.log(
		`\n${findings.length === 0 ? "✓" : "!"} ${shown}: release note${findings.length === 0 ? ", listed on the release notes page as written" : ""}`,
	);
	for (const finding of findings) {
		console.log(`  ${finding.level}: ${finding.message}`);
		console.log(`    fix: ${finding.fix.replace(/\n/g, "\n         ")}`);
	}
	return 0;
}

export async function checkOneFile(
	path: string,
	asJson: boolean,
	quick = false,
) {
	if (/\/content\/book\/releases\//.test(resolveFromCaller(path))) {
		process.exit(checkReleaseFile(path, asJson));
	}
	const checked = checkContentFile(path);
	if ("error" in checked) {
		console.error(checked.error);
		process.exit(1);
	}
	const { book, section, file } = checked;
	// Then the compiler the build uses, unless an HTML comment already explains
	// why it would fail.
	const compiled =
		file.endsWith(".mdx") &&
		!checked.result.findings.some(
			(finding) => finding.code === "MDX_HTML_COMMENT",
		)
			? compileFinding(
					await compileMdx(
						readFileSync(file, "utf8"),
						join(repoRoot(), "apps", book),
					),
				)
			: null;
	const findings = [
		...checked.result.findings,
		...(compiled ? [compiled] : []),
	];
	const result = {
		...checked.result,
		findings,
		ok: !findings.some((finding) => finding.level === "error"),
	};
	// A mechanism file also gets the duplicate check `new mechanism` runs.
	const similar =
		section === "mechanism"
			? similarForMechanismFile(result.frontmatter, book)
			: [];
	const slug =
		typeof result.frontmatter?.slug === "string" ? result.frontmatter.slug : "";
	const judged =
		section === "mechanism" && slug
			? await judgedForMechanism(slug, book, quick)
			: null;
	// The book's suggestions about this file: advice, never a failure.
	const suggestions = suggestionsForFile(book, file);
	// A chapter's word count against the stub threshold, and what it binds.
	const draft =
		section === "chapter"
			? chapterDraft(
					readFileSync(file, "utf8"),
					Array.isArray(result.frontmatter?.mechanisms)
						? result.frontmatter.mechanisms.filter(
								(slug): slug is string => typeof slug === "string",
							)
						: [],
					loadBookContent(book).mechanisms.map((m) => m.slug),
					(await loadBookConfigSummary(book)).site,
					book,
				)
			: null;
	if (asJson) {
		console.log(
			JSON.stringify(
				{
					book,
					section,
					...result,
					frontmatter: undefined,
					body: undefined,
					similar,
					judged,
					suggestions,
					draft,
				},
				null,
				2,
			),
		);
		process.exit(result.ok ? 0 : 1);
	}
	console.log(
		`\n${result.ok ? "✓" : "✗"} ${path} (${section} in ${book}): ${result.findings.length === 0 ? "compiles with no findings" : `${result.findings.length} finding(s)`}`,
	);
	for (const finding of result.findings) {
		console.log(`  ${finding.level}: ${finding.message}`);
		if (finding.fix)
			console.log(`    fix: ${finding.fix.replace(/\n/g, "\n    ")}`);
	}
	const describe = (match: (typeof similar)[number]) =>
		`    ${match.slug} (${match.books.join(", ")}) ${match.score}${match.ruledDistinct ? ` — ruled distinct: ${match.ruledDistinct}` : ""}`;
	const ownCorpus = similar.filter((match) => match.sameCorpus);
	const elsewhere = similar.filter((match) => !match.sameCorpus);
	if (ownCorpus.length > 0) {
		console.log("  may duplicate (by wording):");
		for (const match of ownCorpus) console.log(describe(match));
	}
	// A pair you ruled on needs nothing more.
	if (ownCorpus.some((match) => !match.ruledDistinct)) {
		console.log(
			`    Same idea: bun run bookkit merge <that slug> ${slug || "<this slug>"} --reason "<why>". Different: bun run bookkit rule <a> <b> --distinct "<reason>".`,
		);
	}
	if (elsewhere.length > 0) {
		console.log(
			`  similar wording in books outside ${book}'s corpus (for information; nothing to change):`,
		);
		for (const match of elsewhere) console.log(describe(match));
	}
	if (judged) printJudged(slug, judged);
	if (draft) printDraft(draft);
	if (suggestions.length > 0) {
		console.log("  suggestions (advisory; they never fail a check):");
		for (const suggestion of suggestions) {
			console.log(`    ${suggestion.message}`);
			console.log(`      → ${suggestion.nextAction}`);
		}
	}
	process.exit(result.ok ? 0 : 1);
}

function printDraft(draft: ChapterDraft) {
	console.log(
		draft.stub
			? `  draft: ${draft.words} words of prose, a stub until ${draft.minimum}. A stub stays out of search and does not count as drafted.`
			: `  draft: ${draft.words} words of prose.`,
	);
	console.log(
		`  binds: ${draft.binds.length > 0 ? draft.binds.join(", ") : "no mechanism yet"}${draft.unknown.length > 0 ? ` (${draft.unknown.join(", ")}: not a mechanism of this book; see the error above)` : ""}.`,
	);
	if (draft.unbound.length > 0) {
		console.log(
			`  the book's other mechanisms: ${draft.unbound.join(", ")}. Bind one by adding its slug to mechanisms: before naming a new idea.`,
		);
	}
	if (draft.corpusHints && draft.corpusHints.length > 0) {
		console.log("  corpus hints (reuse existing concepts):");
		for (const hint of draft.corpusHints) {
			if (hint.action === "bind") {
				console.log(
					`    • ${hint.slug}: mentioned in prose — bind by adding to mechanisms:`,
				);
			} else {
				console.log(
					`    • ${hint.slug} (${hint.books.join(", ")}): mentioned in prose — share with bun run bookkit sync ${hint.slug} --to <this book>`,
				);
			}
		}
	}
}

/** The warning-level suggestions `bookkit check <book>` makes about one file. */
function suggestionsForFile(
	book: string,
	file: string,
): Array<{ category: string; message: string; nextAction: string }> {
	const content = loadBookContent(book);
	const recurring = findRecurringTerms(content.chapterBodies, {
		vocabulary: content.vocabulary,
	});
	return runBookSuggestions({
		book,
		mechanisms: content.mechanisms,
		chapters: content.chapters,
		examples: content.examples,
		chapterBodies: content.chapterBodies,
		conceptFlags: recurring.candidates,
		vocabulary: content.vocabulary,
		frame: content.frame,
		tools: content.tools,
	})
		.filter(
			(suggestion) =>
				suggestion.file === file && suggestion.severity !== "info",
		)
		.map(({ category, message, nextAction }) => ({
			category,
			message,
			nextAction,
		}));
}

type MechanismJudges = {
	calls: Array<{ other: string; call: PairCall; ruledDistinct: boolean }>;
	/** Of its 3 nearest mechanisms in its corpus, those with no verdict and no ruling. */
	unasked: string[];
	nearestBy: "meaning" | "wording";
};

/**
 * Judges' calls on a mechanism's pairs (corpus-judgments.json), as its text
 * reads now, and which of its 3 nearest in its corpus have neither a verdict
 * nor a ruling: by meaning when check:corpus has stored every vector, else by
 * wording. An edited mechanism has no current verdicts, so its nearest are
 * unjudged under either ranking; the ranking matters only for unchanged
 * text, whose vectors are stored. --judge-for ranks the same way.
 */
async function judgedForMechanism(
	slug: string,
	book: string,
	quick: boolean,
): Promise<MechanismJudges> {
	const read = readJudgments(repoRoot());
	const records = "error" in read ? [] : read.records;
	const books = listBookDirs();
	const scope = corpusScope(books, readCorpusBooks());
	const corpus = books
		.filter((other) => scope.corpusOf(other) === scope.corpusOf(book))
		.flatMap((other) =>
			loadBookContent(other).mechanisms.map((m) => ({ ...m, book: other })),
		);
	const unique = [
		...new Map(
			corpus.filter((m) => m.definition.trim()).map((m) => [m.slug, m]),
		).values(),
	];
	let distinct: Array<{ pair: [string, string] }> = [];
	try {
		const corpusPath = join(repoRoot(), "corpus.json");
		if (existsSync(corpusPath))
			distinct = JSON.parse(readFileSync(corpusPath, "utf8")).distinct ?? [];
	} catch {
		// check:corpus reports an unreadable corpus.json.
	}
	const ruled = (other: string) =>
		distinct.some(({ pair }) => pair.includes(slug) && pair.includes(other));
	const calls = callsFor(slug, records, corpus).map((judged) => ({
		...judged,
		ruledDistinct: ruled(judged.other),
	}));
	const target = unique.find((m) => m.slug === slug);
	if (!target) return { calls, unasked: [], nearestBy: "wording" };
	let vectorOf: ((m: CorpusMechanism) => Float32Array | null) | undefined;
	if (!quick) {
		const embedded = await embedTexts(
			unique.map(corpusEmbeddingText),
			EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL_KEY],
			// Stored vectors only: loading the model would cost seconds per edit.
			{ storedOnly: true, interactive: false, log: () => {} },
		);
		if (embedded.ok) {
			const bySlug = new Map(
				unique.map((m, index) => [m.slug, embedded.vectors[index]]),
			);
			vectorOf = (m) => bySlug.get(m.slug) ?? null;
		}
	}
	const judgedOthers = new Set(calls.map(({ other }) => other));
	const unasked = nearestTo(target, unique, 3, vectorOf)
		.map((m) => m.slug)
		.filter((other) => !judgedOthers.has(other) && !ruled(other));
	return { calls, unasked, nearestBy: vectorOf ? "meaning" : "wording" };
}

function printJudged(slug: string, judges: MechanismJudges) {
	// A pair the author ruled on is settled, whatever the judges said.
	const open = judges.calls.filter(
		({ call, ruledDistinct }) => call.call !== "distinct" && !ruledDistinct,
	);
	for (const { other, call } of open) {
		console.log(
			call.call === "same-idea"
				? `  judges: the same idea as ${other} (${call.votes} of ${call.votes}). Fold it in: bun run bookkit merge ${other} ${slug} --reason "<why>"; or: bun run bookkit rule ${slug} ${other} --distinct "<reason>"`
				: `  judges split on ${other}: same idea ${call.call === "split" ? call.sameIdea : 0} of ${call.votes}. Settle it: bun run bookkit merge ${other} ${slug} --reason "<why>", or bun run bookkit rule ${slug} ${other} --distinct "<reason>"`,
		);
	}
	if (judges.calls.length > 0 && open.length === 0) {
		console.log(
			`  judges: compared it with ${judges.calls.length} mechanism(s); none is open (not the same idea, or you ruled the pair).`,
		);
	}
	// Verdicts follow the text, so an edited definition starts with none.
	// Named only when ranked by meaning, as `bookkit judge` ranks when it can;
	// by wording, the pairs it asks about may differ.
	if (judges.unasked.length > 0) {
		console.log(
			judges.nearestBy === "meaning"
				? `  judges: no verdict yet on ${judges.unasked.join(", ")}, among its 3 nearest. Ask: bun run bookkit judge ${slug}`
				: `  judges: no verdict yet on some of its nearest mechanisms. Ask: bun run bookkit judge ${slug}`,
		);
	}
}
