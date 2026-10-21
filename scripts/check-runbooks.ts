import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import {
	auditReleaseControlDrift,
	auditReviewCadence,
	auditRunbookCoverage,
	type ComplianceRow,
	type ComplianceSummary,
	deriveComplianceMatrix,
	type MechanismRecord,
	type ReleaseRecord,
	summarizeCompliance,
	type ToolRecord,
} from "../packages/astro-bookkit/src/suggestions";
import { extractFrameConfigFromSource } from "../packages/astro-bookkit/src/validators/frame-config";
import { listBookDirs, optionalArg, repoRoot } from "./_lib";
import { exitOnHelp } from "./lib/cli";
import {
	arrayValue,
	listContentFiles,
	parseFrontmatter,
	toStringValue,
} from "./lib/content-frontmatter";

exitOnHelp({
	summary:
		"Audits a runbook book's controls (mechanism, action, drill, escalation,\nowner), prints its compliance matrix, and flags drift between release\nnotes and the current coverage. Books on another frame are skipped.",
	usage: [
		"bun run check:runbooks [--book <book>] [--mode error] [--export <file>]",
	],
	options: [
		["--book <book>", "One book (default: every book)"],
		[
			"--mode error",
			"Exit 1 on any warning: an overdue review, an undrilled\ncontrol, or a control with no action",
		],
		["--export <file>", "Also write the compliance matrix to a JSON file"],
	],
	examples: [
		"bun run check:runbooks",
		"bun run check:runbooks -- --book on-call --mode error",
	],
});

const requestedBook = optionalArg("--book");
const mode = optionalArg("--mode") ?? "warn";
const exportFile = optionalArg("--export");

const workspaceRoot = repoRoot();

const exportComplianceTo = (
	book: string,
	rows: ComplianceRow[],
	summary: ComplianceSummary,
	warnings: number,
	target: string,
): void => {
	const artifact = {
		book,
		generatedAt: new Date().toISOString(),
		frame: "runbook",
		compliance: summary,
		rows: rows.map((r) => ({
			control: r.control,
			mechanism: r.mechanism,
			tools: r.tools,
			drillReady: r.drillReady,
			nextReviewDue: r.nextReviewDue,
			reviewOverdue: r.reviewOverdue,
		})),
		openWarnings: warnings,
	};
	const targetPath = isAbsolute(target) ? target : join(workspaceRoot, target);
	mkdirSync(dirname(targetPath), { recursive: true });
	writeFileSync(targetPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
	console.log(`\nCompliance artifact written to ${targetPath}`);
};

const checkBook = (book: string): number => {
	const configPath = join(workspaceRoot, "apps", book, "src", "book.config.ts");
	if (!existsSync(configPath)) {
		console.log(`\nSKIP ${book} — no book.config.ts`);
		return 0;
	}
	const configSource = readFileSync(configPath, "utf8");
	const frame = extractFrameConfigFromSource(configSource)?.slug;
	if (frame !== "runbook") {
		console.log(`\nSKIP ${book} — frame "${frame ?? "none"}" is not runbook`);
		return 0;
	}
	// An example book's review dates are fixtures; it names the day to judge
	// them on, so they do not go overdue as time passes. Real books leave it out.
	const asOf = configSource.match(
		/\breviewsAsOf\s*:\s*["'`](\d{4}-\d{2}-\d{2})["'`]/,
	)?.[1];
	if (asOf) {
		console.log(
			`\nREVIEW DATES ${book}: judged as of ${asOf} (reviewsAsOf in book.config.ts), not today`,
		);
	}

	const bookRoot = join(workspaceRoot, "apps", book, "src", "content", "book");
	const read = (file: string) => readFileSync(file, "utf8");
	const mechanismFiles = listContentFiles(join(bookRoot, "mechanisms"));
	const toolkitFiles = listContentFiles(join(bookRoot, "toolkit"));
	const releaseFiles = listContentFiles(join(bookRoot, "releases"));

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
			reviewEveryDays:
				typeof data.reviewEveryDays === "number"
					? data.reviewEveryDays
					: undefined,
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

	const releases: ReleaseRecord[] = releaseFiles.map((file) => {
		const { data } = parseFrontmatter(read(file));
		const sections = arrayValue(data.changedSections);
		return {
			version: toStringValue(data.version) || file,
			date: toStringValue(data.date) || "",
			title: toStringValue(data.title),
			changedSections: sections,
		};
	});

	const suggestions = auditRunbookCoverage({
		book,
		frame: "runbook",
		mechanisms,
		tools,
	});

	const rows = deriveComplianceMatrix(mechanisms, tools, { releases, asOf });
	const drift = auditReleaseControlDrift(rows, releases, book);
	const cadence = auditReviewCadence(book, tools, releases, asOf);

	const all = [...suggestions, ...drift, ...cadence];
	const warnings = all.filter((s) => s.severity === "warning");

	if (all.length > 0) {
		console.log(`\nRUNBOOK CHECKS (${all.length}) [${book}]`);
		for (const s of all) {
			const location = s.file ? s.file.replace(`${bookRoot}/`, "") : "(book)";
			console.log(`- [${s.category}/${s.severity}] ${location}: ${s.message}`);
			console.log(`    → ${s.nextAction}`);
		}
	}

	const summary = summarizeCompliance(rows);
	if (rows.length > 0) {
		console.log(
			`COMPLIANCE ${book}: ${summary.covered}/${summary.total} controls with tool coverage`,
		);
		for (const row of rows) {
			const drilled = row.drillReady ? " ✓drilled" : "";
			const review = row.reviewOverdue
				? ` ⚠review overdue (due ${row.nextReviewDue})`
				: row.nextReviewDue
					? ` ·review due ${row.nextReviewDue}`
					: "";
			console.log(
				`  ${row.control} → ${row.mechanism} [${row.tools.join(", ") || "uncovered"}]${drilled}${review}`,
			);
		}
		if (summary.uncoveredControls.length > 0) {
			console.log(`  Uncovered: ${summary.uncoveredControls.join(", ")}`);
		}
	}

	if (exportFile && frame === "runbook") {
		exportComplianceTo(book, rows, summary, warnings.length, exportFile);
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
if (shouldFail) {
	console.error(`\n${totalWarnings} runbook warning(s) in error mode.`);
}
process.exit(shouldFail ? 1 : 0);
