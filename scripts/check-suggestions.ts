import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type ChapterRecord,
	type ExampleRecord,
	extractConceptFlags,
	type MechanismRecord,
	runBookSuggestions,
} from "../packages/astro-bookkit/src/suggestions";
import { listBookDirs, optionalArg } from "./_lib";
import {
	arrayValue,
	listContentFiles,
	parseFrontmatter,
	toStringValue,
} from "./lib/content-frontmatter";

const requestedBook = optionalArg("--book");
const mode = optionalArg("--mode") ?? "warn";
const showInfo = process.argv.includes("--info");
const maxProposals = Number(optionalArg("--max-proposals") ?? "5");

const workspaceRoot = join(import.meta.dir, "..");
const read = (file: string) => readFileSync(file, "utf8");

const checkBook = (book: string): number => {
	const bookRoot = join(workspaceRoot, "apps", book, "src", "content", "book");
	if (!existsSync(bookRoot)) {
		console.error(`Missing content directory: ${bookRoot}`);
		return 0;
	}

	const mechanismFiles = listContentFiles(join(bookRoot, "mechanisms"));
	const chapterFiles = listContentFiles(join(bookRoot, "chapters"));
	const exampleFiles = listContentFiles(join(bookRoot, "examples"));
	const glossaryFiles = listContentFiles(join(bookRoot, "glossary"));
	const toolkitFiles = listContentFiles(join(bookRoot, "toolkit"));

	const mechanisms: MechanismRecord[] = mechanismFiles.map((file) => {
		const { data } = parseFrontmatter(read(file));
		return {
			slug: toStringValue(data.slug),
			title: toStringValue(data.title) || toStringValue(data.slug),
			definition: toStringValue(data.definition),
			is: arrayValue(data.is),
			isNot: arrayValue(data.isNot),
			predictions: arrayValue(data.predictions),
			tests: arrayValue(data.tests),
			file,
		};
	});

	const chapterParsed = chapterFiles.map((file) => {
		const { data, body } = parseFrontmatter(read(file));
		return {
			slug: toStringValue(data.slug) || file,
			title: toStringValue(data.title) || toStringValue(data.slug) || file,
			mechanisms: arrayValue(data.mechanisms),
			prerequisites: arrayValue(data.prerequisites),
			file,
			body,
		};
	});

	const chapters: ChapterRecord[] = chapterParsed.map(
		({ body, ...chapter }) => ({
			...chapter,
			body,
		}),
	);
	const chapterBodies = chapterParsed.map((c) => ({
		file: c.file ?? c.slug,
		body: c.body,
	}));

	const examples: ExampleRecord[] = exampleFiles.map((file) => {
		const { data, body } = parseFrontmatter(read(file));
		return {
			mechanism: toStringValue(data.mechanism),
			domain: toStringValue(data.domain),
			title: toStringValue(data.title) || file,
			body,
			file,
			frontmatterKeys: Object.keys(data),
		};
	});

	const glossaryTerms = glossaryFiles.map((file) =>
		toStringValue(parseFrontmatter(read(file)).data.term),
	);
	const toolkitNames = toolkitFiles.map((file) =>
		toStringValue(parseFrontmatter(read(file)).data.name),
	);
	const vocabulary = [
		...mechanisms.map((m) => m.slug),
		...mechanisms.map((m) => m.title),
		...glossaryTerms,
		...toolkitNames,
	].filter(Boolean);

	const suggestions = runBookSuggestions({
		book,
		mechanisms,
		chapters,
		examples,
		chapterBodies,
		conceptFlags: extractConceptFlags(chapterBodies),
		vocabulary,
		maxMechanismProposals: maxProposals,
	});

	const visible = suggestions.filter((s) => showInfo || s.severity !== "info");
	const warnings = visible.filter((s) => s.severity === "warning");

	if (visible.length > 0) {
		console.log(`\nSUGGESTIONS (${visible.length}) [${book}]`);
		for (const suggestion of visible) {
			const location = suggestion.file
				? suggestion.file.replace(`${bookRoot}/`, "")
				: "(book)";
			console.log(
				`- [${suggestion.category}/${suggestion.severity}] ${location}: ${suggestion.message}`,
			);
			console.log(`    → ${suggestion.nextAction}`);
			if (suggestion.evidence.draft) {
				const draft = suggestion.evidence.draft as {
					slug?: string;
					definition?: string;
					is?: string[];
				};
				console.log(
					`    draft: ${draft.slug ?? ""} — ${draft.definition ?? ""}`,
				);
				for (const item of draft.is ?? []) console.log(`        is: ${item}`);
			}
		}
	}

	return warnings.length;
};

const books = requestedBook ? [requestedBook] : listBookDirs();
let totalWarnings = 0;
for (const book of books) {
	totalWarnings += checkBook(book);
}

if (books.length === 0) {
	console.error("No books found under apps/.");
	process.exit(1);
}

const shouldFail = mode === "error" && totalWarnings > 0;
process.exit(shouldFail ? 1 : 0);
