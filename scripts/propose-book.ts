import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
	buildProposalBundle,
	describeExample,
	mechanismFrontmatter,
	type ProposalBundle,
	toolFrontmatter,
} from "../packages/astro-bookkit/src";
import { ensureDir, listBookDirs, optionalArg, repoRoot } from "./_lib";
import { booksFromArgv } from "./lib/book-args";
import {
	planEdges,
	withMechanisms,
	withPrerequisites,
} from "./lib/chapter-prerequisites";
import { loadBookContent } from "./lib/load-book";

const USAGE =
	"bun run bookkit propose <book> [--write] [--apply all|mechanisms|tools|edges|config] [--id <proposal>] [--detect-frame]";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
	console.log(`Draft mechanisms, tools, prerequisite edges, and a config from a book's own text.

Usage: ${USAGE}

With no --apply it only shows the proposals. --apply writes them: all, or one
kind at a time (repeat --apply for several); --id <proposal> keeps only that
one. Nothing already registered is overwritten. --write also saves the bundle
to apps/<book>/proposals/.`);
	process.exit(0);
}

const {
	books: [book],
} = booksFromArgv(listBookDirs(), {
	usage: USAGE,
	valueFlags: [
		"--title",
		"--causal-stance",
		"--max-proposals",
		"--id",
		"--apply",
	],
	requireOne: true,
});
const title = optionalArg("--title") ?? undefined;
const causalStance = optionalArg("--causal-stance") ?? undefined;
const maxProposals = Number(optionalArg("--max-proposals") ?? "5");
const writeArtifacts = process.argv.includes("--write");
const force = process.argv.includes("--force");
const forceDetection = process.argv.includes("--detect-frame");

const requestedIds = new Set<string>();
const COLON_FLAG = "--id";
for (let index = 0; index < process.argv.length; index += 1) {
	if (process.argv[index] === COLON_FLAG && process.argv[index + 1]) {
		requestedIds.add(process.argv[index + 1]);
	}
}

const APPLY_KINDS = ["mechanisms", "tools", "edges", "config"] as const;
const applyKinds = new Set<string>();
for (let index = 0; index < process.argv.length; index += 1) {
	if (process.argv[index] === "--apply") {
		const kind = process.argv[index + 1];
		if (!kind || kind.startsWith("--")) {
			console.error(
				`--apply needs what to write: all, or one of ${APPLY_KINDS.join(", ")}.\nUsage: ${USAGE}`,
			);
			process.exit(1);
		}
		if (kind === "all") {
			for (const each of APPLY_KINDS) applyKinds.add(each);
		} else if (APPLY_KINDS.includes(kind as (typeof APPLY_KINDS)[number])) {
			applyKinds.add(kind);
		} else {
			console.error(
				`Unknown --apply kind "${kind}". Valid kinds: all, ${APPLY_KINDS.join(", ")}`,
			);
			process.exit(1);
		}
	}
}

const workspaceRoot = repoRoot();

const content = loadBookContent(book);
if (!existsSync(content.bookRoot)) {
	console.error(`Missing content directory: ${content.bookRoot}`);
	process.exit(1);
}

const bundle = buildProposalBundle({
	book,
	chapters: content.chapters,
	chapterBodies: content.chapterBodies,
	mechanisms: content.mechanisms,
	tools: content.tools,
	glossaryTerms: content.glossaryTerms,
	existingFrame: forceDetection ? undefined : content.frame,
	title,
	causalStance,
	maxMechanismProposals: maxProposals,
});

const acceptsId = (id: string): boolean =>
	requestedIds.size === 0 || requestedIds.has(id);

const acceptedMechanisms = bundle.mechanisms.filter((m) => acceptsId(m.id));
const acceptedEdges = bundle.edges.filter((e) => acceptsId(e.id));
const acceptedTools = bundle.tools.filter((t) => acceptsId(t.id));

printBundle(bundle);
if (
	applyKinds.size === 0 &&
	acceptedMechanisms.length + acceptedTools.length + acceptedEdges.length > 0
) {
	console.log(
		`\nNext: bun run bookkit propose ${book} --apply all writes them (or --apply mechanisms, tools, edges, or config; --id <proposal> for one). Nothing already registered is overwritten.`,
	);
}

const proposalsDir = join(workspaceRoot, "apps", book, "proposals");
if (writeArtifacts) {
	ensureDir(proposalsDir);
	const jsonPath = join(proposalsDir, "proposal-bundle.json");
	const mdPath = join(proposalsDir, "proposal-bundle.md");
	writeFileSync(jsonPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
	writeFileSync(mdPath, renderMarkdown(bundle), "utf8");
	console.log(`\nArtifacts written:`);
	console.log(`  + ${jsonPath}`);
	console.log(`  + ${mdPath}`);
}

if (applyKinds.size > 0) {
	applyConfig(applyKinds.has("config"));
	const writtenMechanismSlugs = applyMechanisms(acceptedMechanisms);
	applyTools(acceptedTools, writtenMechanismSlugs);
}

applyEdges(acceptedEdges);
if (
	applyKinds.size > 0 &&
	!applyKinds.has("edges") &&
	acceptedEdges.length > 0
) {
	console.log(
		`\n${acceptedEdges.length} prerequisite edge(s) not written: --apply edges adds them to the chapters' prerequisites.`,
	);
}

function printBundle(bundleToPrint: ProposalBundle): void {
	const confidenceLabel =
		bundleToPrint.frame.source === "declared"
			? "author-declared"
			: `detected (confidence ${bundleToPrint.frame.confidence.toFixed(2)})`;
	console.log(
		`\nPROPOSAL BUNDLE [${bundleToPrint.book}] (${bundleToPrint.generatedAt})`,
	);
	console.log(
		`frame: ${bundleToPrint.frame.frameSlug} (${confidenceLabel}) · runbook signals ${bundleToPrint.frame.runbookHits} · teaching signals ${bundleToPrint.frame.teachingHits}`,
	);

	const { analysis } = bundleToPrint;
	console.log(
		`read: ${analysis.chaptersRead} chapter(s), ${analysis.wordsRead} words of prose`,
	);

	console.log(`\nmechanisms (${acceptedMechanisms.length})`);
	for (const m of acceptedMechanisms) {
		console.log(
			`  - [${m.id}] "${m.title}": used ${m.evidence.occurrences} times in ${m.evidence.files.length} chapters (draft; you write the definition and boundaries)`,
		);
		if (m.evidence.example) {
			console.log(
				`      e.g. ${describeExample(m.evidence.example, `${content.bookRoot}/chapters`)}`,
			);
		}
	}
	if (acceptedMechanisms.length === 0) {
		console.log(`  (none) ${mechanismsSummary(bundleToPrint)}`);
	}
	if (analysis.registered.length > 0) {
		console.log(
			`  recurring and already registered: ${analysis.registered.map((r) => (r.term.toLowerCase() === r.registeredAs.toLowerCase() ? r.term : `${r.term} (as ${r.registeredAs})`)).join("; ")}`,
		);
	}
	if (analysis.belowThreshold.length > 0) {
		const shown = analysis.belowThreshold.slice(0, 8);
		console.log(
			`  recurring but under 3 uses in 2+ chapters, not proposed: ${shown.map((t) => `${t.term} (${t.occurrences}×)`).join(", ")}${analysis.belowThreshold.length > shown.length ? `, and ${analysis.belowThreshold.length - shown.length} more` : ""}`,
		);
	}

	console.log(`\nedges (${acceptedEdges.length})`);
	for (const e of acceptedEdges) {
		console.log(
			`  - [${e.id}] chapter "${e.chapter}" should list "${e.introducedIn}" as prerequisite (via "${e.mechanism}")`,
		);
	}
	if (acceptedEdges.length === 0) {
		console.log("  (none — chapter ordering already consistent)");
	}

	console.log(`\ntools (${acceptedTools.length})`);
	for (const t of acceptedTools) {
		console.log(`  - [${t.id}] mechanism "${t.mechanism}" · "${t.name}"`);
	}
	if (acceptedTools.length === 0) {
		console.log("  (none — every mechanism already has a bound tool)");
	}

	console.log(
		`\nconfig draft: ${bundleToPrint.config.id} · intent "${bundleToPrint.config.intent}"`,
	);
	console.log(
		`  frame.slug "${bundleToPrint.config.frame.frameSlug}" with ${content.hasBookConfig ? "existing config (draft is advisory)" : "no book.config.ts yet — draft is the recommended starting config"}`,
	);
}

/** Why there are no mechanism proposals: nothing read, or nothing recurring. */
function mechanismsSummary(bundleToSummarize: ProposalBundle): string {
	const { analysis } = bundleToSummarize;
	if (analysis.chaptersRead === 0) {
		return `nothing analyzed: no chapter prose in ${relative(workspaceRoot, join(content.bookRoot, "chapters"))}. Add chapters (bun run bookkit import ${book} --dir <folder>) and run this again.`;
	}
	if (analysis.registered.length > 0 && analysis.belowThreshold.length === 0) {
		return `every term that recurs across chapters is already registered (${analysis.chaptersRead} chapter(s) read).`;
	}
	return `no unregistered term is used 3 or more times across 2 or more of the ${analysis.chaptersRead} chapter(s) read.`;
}

function applyMechanisms(
	mechanismsToWrite: ProposalBundle["mechanisms"],
): Set<string> {
	const written = new Set<string>();
	if (applyKinds.has("mechanisms")) {
		if (mechanismsToWrite.length === 0) {
			console.log("\nNo mechanism proposals to apply.");
		} else {
			const outDir = join(content.bookRoot, "mechanisms");
			ensureDir(outDir);
			console.log(`\nApplying mechanisms (${mechanismsToWrite.length})...`);
			for (const m of mechanismsToWrite) {
				const outPath = join(outDir, `${m.slug}.mdx`);
				if (existsSync(outPath) || content.vocabulary.includes(m.slug)) {
					console.log(`  ~ skipped ${m.slug} (already registered)`);
					continue;
				}
				writeFileSync(outPath, mechanismFrontmatter(m), "utf8");
				console.log(
					`  + wrote ${relative(workspaceRoot, outPath)} (draft: name and evidence only; write its definition, is, and isNot)`,
				);
				written.add(m.slug);
			}
			bindToEvidence(mechanismsToWrite.filter((m) => written.has(m.slug)));
		}
	}
	return written;
}

/**
 * Each mechanism written, bound to the chapters its evidence comes from (their
 * `mechanisms:`), so the book links them and the suggestions stop calling
 * the idea named but unbound.
 */
function bindToEvidence(mechanisms: ProposalBundle["mechanisms"]): void {
	const adding = new Map<string, string[]>();
	for (const m of mechanisms) {
		for (const file of m.evidence.files) {
			adding.set(file, [...(adding.get(file) ?? []), m.slug]);
		}
	}
	for (const chapter of content.chapters) {
		const slugs = chapter.file ? adding.get(chapter.file) : undefined;
		if (!slugs || !chapter.file) continue;
		const before = readFileSync(chapter.file, "utf8");
		const after = withMechanisms(before, slugs);
		if (after === before) continue;
		writeFileSync(chapter.file, after, "utf8");
		console.log(
			`  ~ ${relative(workspaceRoot, chapter.file)}: mechanisms + ${slugs.join(", ")}`,
		);
	}
}

function applyTools(
	toolsToWrite: ProposalBundle["tools"],
	registeredMechanisms: Set<string>,
): void {
	if (!applyKinds.has("tools")) return;
	if (toolsToWrite.length === 0) {
		console.log("\nNo tool proposals to apply.");
		return;
	}
	const outDir = join(content.bookRoot, "toolkit");
	ensureDir(outDir);
	console.log(`\nApplying tools (${toolsToWrite.length})...`);
	for (const t of toolsToWrite) {
		const mechanismRegistered =
			content.mechanisms.some((m) => m.slug === t.mechanism) ||
			registeredMechanisms.has(t.mechanism);
		if (!mechanismRegistered) {
			console.log(
				`  ~ skipped ${t.slug} (mechanism "${t.mechanism}" is not registered yet; apply mechanisms first)`,
			);
			continue;
		}
		const outPath = join(outDir, `${t.slug}.mdx`);
		if (existsSync(outPath)) {
			console.log(`  ~ skipped ${t.slug} (already exists)`);
			continue;
		}
		writeFileSync(outPath, toolFrontmatter(t), "utf8");
		console.log(
			`  + wrote ${relative(workspaceRoot, outPath)} (draft: rename it after the move it makes, then fill its steps)`,
		);
	}
}

/** Writes accepted edges into the chapters' prerequisites, keeping the reading graph acyclic. */
function applyEdges(edgesToWrite: ProposalBundle["edges"]): void {
	if (!applyKinds.has("edges")) return;
	if (edgesToWrite.length === 0) {
		console.log("\nNo prerequisite edges to apply.");
		return;
	}
	const plan = planEdges(content.chapters, edgesToWrite);
	console.log(`\nApplying prerequisite edges (${edgesToWrite.length})...`);
	for (const chapter of content.chapters) {
		const adding = plan.add.get(chapter.slug);
		if (!adding || !chapter.file) continue;
		writeFileSync(
			chapter.file,
			withPrerequisites(readFileSync(chapter.file, "utf8"), adding),
			"utf8",
		);
		console.log(
			`  ~ ${relative(workspaceRoot, chapter.file)}: prerequisites + ${adding.join(", ")}`,
		);
	}
	for (const { edge, why } of plan.skipped) {
		console.log(`  ~ skipped ${edge.id} (${why})`);
	}
}

function applyConfig(shouldApply: boolean): void {
	if (!shouldApply) return;
	ensureDir(proposalsDir);
	const outPath = join(proposalsDir, "book.config.draft.ts");
	if (existsSync(outPath) && !force) {
		console.log(
			`\nRefusing to overwrite ${outPath}. Pass --force to regenerate the draft.`,
		);
		return;
	}
	writeFileSync(outPath, bundle.config.source, "utf8");
	console.log(`\n+ wrote config draft ${outPath}`);
	if (content.hasBookConfig) {
		console.log(
			"The book already has book.config.ts; the live config remains authoritative. Use this draft only as a reference.",
		);
	} else {
		console.log(
			"Review the draft, then copy it to apps/<book>/src/book.config.ts. The frame and steps are proposals, not decisions.",
		);
	}
}

function renderMarkdown(bundleToRender: ProposalBundle): string {
	const lines: string[] = [
		`# Proposal bundle — ${bundleToRender.book}`,
		"",
		`Generated ${bundleToRender.generatedAt}. AI proposes; the compiler decides. Materialize accepted proposals with:`,
		"",
		"```bash",
		`bun run bookkit propose ${bundleToRender.book} --apply mechanisms --apply tools --apply edges --apply config`,
		"```",
		"",
		"## Frame proposal",
		"",
		`- Detected frame: \`${bundleToRender.frame.frameSlug}\` (confidence ${bundleToRender.frame.confidence.toFixed(2)})`,
		`- Runbook signals: ${bundleToRender.frame.runbookHits} · Teaching signals: ${bundleToRender.frame.teachingHits}`,
		`- Config intent: ${bundleToRender.config.intent}`,
		"",
		"## Mechanism proposals",
		"",
	];
	lines.push(
		`Read ${bundleToRender.analysis.chaptersRead} chapter(s), ${bundleToRender.analysis.wordsRead} words of prose. Each proposal is a draft: the name and the evidence come from the text, and the definition and boundaries are yours to write.`,
		"",
	);
	if (bundleToRender.mechanisms.length === 0) {
		lines.push(`_None: ${mechanismsSummary(bundleToRender)}_`);
	}
	for (const m of bundleToRender.mechanisms) {
		lines.push(`### ${m.id}`);
		lines.push("");
		lines.push(`- Title: ${m.title} (status: draft)`);
		lines.push(
			`- Evidence: "${m.evidence.term}" used ${m.evidence.occurrences} times in ${m.evidence.files.map((file) => relative(content.bookRoot, file)).join(", ")}`,
		);
		if (m.evidence.example) {
			lines.push(
				`- Example: ${describeExample(m.evidence.example, content.bookRoot)}`,
			);
		}
		lines.push("");
	}
	lines.push("## Prerequisite edges", "");
	if (bundleToRender.edges.length === 0) {
		lines.push("_None — chapter ordering already consistent._");
	}
	lines.push(
		"| id | chapter | introduced in | mechanism |",
		"| --- | --- | --- | --- |",
	);
	for (const e of bundleToRender.edges) {
		lines.push(
			`| ${e.id} | \`${e.chapter}\` | \`${e.introducedIn}\` | \`${e.mechanism}\` |`,
		);
	}
	lines.push("", "## Tool proposals", "");
	if (bundleToRender.tools.length === 0) {
		lines.push("_None — every mechanism already has a bound tool._");
	}
	for (const t of bundleToRender.tools) {
		lines.push(`- [${t.id}] mechanism \`${t.mechanism}\` — ${t.name}`);
	}
	return `${lines.join("\n")}\n`;
}
