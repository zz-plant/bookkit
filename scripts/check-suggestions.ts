import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type ChapterRecord,
	deriveComplianceMatrix,
	type ExampleRecord,
	extractConceptFlags,
	type MechanismRecord,
	runBookSuggestions,
	summarizeCompliance,
	type ToolRecord,
} from "../packages/astro-bookkit/src/suggestions";
import { extractFrameConfigFromSource } from "../packages/astro-bookkit/src/validators/frame-config";
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
			satisfies: arrayValue(data.satisfies),
			file,
		};
	});

	const tools: ToolRecord[] = toolkitFiles.map((file) => {
		const { data } = parseFrontmatter(read(file));
		const escalationRaw = Array.isArray(data.escalation)
			? undefined
			: (data.escalation as unknown as Record<string, unknown> | undefined);
		const escalationTo =
			typeof escalationRaw?.to === "string" ? escalationRaw.to : undefined;
		const escalationWhen =
			typeof escalationRaw?.when === "string" ? escalationRaw.when : undefined;
		return {
			slug: toStringValue(data.slug),
			mechanism: toStringValue(data.mechanism),
			name: toStringValue(data.name),
			owner: toStringValue(data.owner),
			drills: arrayValue(data.drills),
			satisfies: arrayValue(data.satisfies),
			escalation:
				escalationRaw && escalationTo && escalationWhen
					? {
							to: escalationTo,
							when: escalationWhen,
							withinHours:
								typeof escalationRaw.withinHours === "number"
									? escalationRaw.withinHours
									: undefined,
						}
					: undefined,
			file,
		};
	});

	const bookConfigPath = join(
		workspaceRoot,
		"apps",
		book,
		"src",
		"book.config.ts",
	);
	const frame = existsSync(bookConfigPath)
		? extractFrameConfigFromSource(read(bookConfigPath))?.slug
		: undefined;

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
		frame,
		tools,
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

	if (frame === "runbook") {
		printComplianceMatrix(book, mechanisms, tools);
	}

	return warnings.length;
};

const printComplianceMatrix = (
	book: string,
	mechanisms: MechanismRecord[],
	tools: ToolRecord[],
): void => {
	const rows = deriveComplianceMatrix(mechanisms, tools);
	if (rows.length === 0) return;

	const summary = summarizeCompliance(rows);
	console.log(`\nCOMPLIANCE MATRIX (${book})`);
	console.log(
		`Controls: ${summary.total} rows, ${summary.covered} with tool coverage`,
	);
	for (const row of rows) {
		const toolsLabel =
			row.tools.length > 0 ? row.tools.join(", ") : "(none — uncovered)";
		const drilled = row.drillReady ? " ✓drilled" : "";
		console.log(
			`- ${row.control} → ${row.mechanism} [${toolsLabel}]${drilled}`,
		);
	}
	if (summary.uncoveredControls.length > 0) {
		console.log(`Uncovered controls: ${summary.uncoveredControls.join(", ")}`);
	}
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
