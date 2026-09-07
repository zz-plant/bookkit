import {
	deriveComplianceMatrix,
	extractConceptFlags,
	type MechanismRecord,
	runBookSuggestions,
	summarizeCompliance,
	type ToolRecord,
} from "../packages/astro-bookkit/src/suggestions";
import { listBookDirs, optionalArg } from "./_lib";
import { loadBookContent } from "./lib/load-book";

const requestedBook = optionalArg("--book");
const mode = optionalArg("--mode") ?? "warn";
const showInfo = process.argv.includes("--info");
const maxProposals = Number(optionalArg("--max-proposals") ?? "5");

type CrossBookRecord = {
	book: string;
	slug: string;
	definition: string;
};
const crossBookRecords: CrossBookRecord[] = [];

const checkBook = (book: string): number => {
	const content = loadBookContent(book);

	for (const mechanism of content.mechanisms) {
		crossBookRecords.push({
			book,
			slug: mechanism.slug,
			definition: mechanism.definition,
		});
	}

	const suggestions = runBookSuggestions({
		book,
		mechanisms: content.mechanisms,
		chapters: content.chapters,
		examples: content.examples,
		chapterBodies: content.chapterBodies,
		conceptFlags: extractConceptFlags(content.chapterBodies),
		vocabulary: content.vocabulary,
		frame: content.frame,
		tools: content.tools,
		maxMechanismProposals: maxProposals,
	});

	const visible = suggestions.filter((s) => showInfo || s.severity !== "info");
	const warnings = visible.filter((s) => s.severity === "warning");

	if (visible.length > 0) {
		console.log(`\nSUGGESTIONS (${visible.length}) [${book}]`);
		for (const suggestion of visible) {
			const location = suggestion.file
				? suggestion.file.replace(`${content.bookRoot}/`, "")
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

	if (content.frame === "runbook") {
		printComplianceMatrix(book, content.mechanisms, content.tools);
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

const printCrossBookMechanismIdentity = (): number => {
	const bySlug = new Map<string, CrossBookRecord[]>();
	for (const record of crossBookRecords) {
		const list = bySlug.get(record.slug) ?? [];
		list.push(record);
		bySlug.set(record.slug, list);
	}

	const collisions = [...bySlug.entries()].filter(
		([, records]) => records.length > 1,
	);
	if (collisions.length === 0) {
		console.log(
			"\nCROSS-BOOK CHECK: no mechanism slug is defined in more than one book.",
		);
		return 0;
	}

	console.log(`\nCROSS-BOOK MECHANISM COLLISIONS (${collisions.length})`);
	for (const [slug, records] of collisions) {
		const diverging = new Set(records.map((r) => r.definition.trim())).size > 1;
		console.log(
			`- [mechanism-identity/${diverging ? "warning" : "advisory"}] slug "${slug}" is defined in: ${records.map((r) => r.book).join(", ")}`,
		);
		for (const record of records) {
			console.log(
				`    ${record.book}: ${record.definition || "(no definition)"}`,
			);
		}
		console.log(
			`    → ${
				diverging
					? "Definitions diverge. Reconcile the boundaries to one referent, or rename one slug — slugs are durable identities (design-notes Invariant 1)."
					: "Definitions agree at name level. Keep the definitions cross-linked so they do not drift apart."
			}`,
		);
	}
	return collisions.length;
};

const books = requestedBook ? [requestedBook] : listBookDirs();
let totalWarnings = 0;
for (const book of books) {
	totalWarnings += checkBook(book);
}

totalWarnings += printCrossBookMechanismIdentity();

if (books.length === 0) {
	console.error("No books found under apps/.");
	process.exit(1);
}

const shouldFail = mode === "error" && totalWarnings > 0;
process.exit(shouldFail ? 1 : 0);
