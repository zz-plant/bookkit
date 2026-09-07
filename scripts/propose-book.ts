import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	buildProposalBundle,
	mechanismFrontmatter,
	type ProposalBundle,
	toolFrontmatter,
} from "../packages/astro-bookkit/src";
import { ensureDir, optionalArg, requireArg, slugify } from "./_lib";
import { loadBookContent } from "./lib/load-book";

const book = requireArg("--book");
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

const APPLY_KINDS = ["mechanisms", "tools", "config"] as const;
const applyKinds = new Set<string>();
for (let index = 0; index < process.argv.length; index += 1) {
	if (process.argv[index] === "--apply" && process.argv[index + 1]) {
		const kind = process.argv[index + 1];
		if (APPLY_KINDS.includes(kind as (typeof APPLY_KINDS)[number])) {
			applyKinds.add(kind);
		} else {
			console.error(
				`Unknown --apply kind "${kind}". Valid kinds: ${APPLY_KINDS.join(", ")}`,
			);
			process.exit(1);
		}
	}
}

const workspaceRoot = join(import.meta.dir, "..");

const bookSlugged = slugify(book);
if (bookSlugged !== book) {
	console.warn(`⚠️ Normalizing book slug from "${book}" to "${bookSlugged}".`);
}

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

if (applyKinds.has("mechanisms")) {
	console.log(
		`\nAccepted edges (${acceptedEdges.length}) require a manual edit:`,
	);
	for (const edge of acceptedEdges) {
		console.log(
			`  - ${edge.chapter} → add prerequisite "${edge.introducedIn}"`,
		);
	}
	console.log(
		"Apply the mechanism proposal first, then edit chapter frontmatter to list these prerequisites.",
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

	console.log(`\nmechanisms (${acceptedMechanisms.length})`);
	for (const m of acceptedMechanisms) {
		console.log(`  - [${m.id}] "${m.title}" — ${m.definition}`);
	}
	if (acceptedMechanisms.length === 0) {
		console.log("  (none — every recurring concept is already registered)");
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
				console.log(`  + wrote ${outPath}`);
				written.add(m.slug);
			}
		}
	}
	return written;
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
		console.log(`  + wrote ${outPath}`);
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
		`bun run bookkit propose ${bundleToRender.book} --apply mechanisms --apply tools --apply config`,
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
	if (bundleToRender.mechanisms.length === 0) {
		lines.push("_None — every recurring concept is already registered._");
	}
	for (const m of bundleToRender.mechanisms) {
		lines.push(`### ${m.id}`);
		lines.push("");
		lines.push(`- Title: ${m.title}`);
		lines.push(`- Definition: ${m.definition}`);
		lines.push(`- Is: ${m.is.join("; ")}`);
		lines.push(`- IsNot: ${m.isNot.join("; ")}`);
		lines.push(
			`- Evidence: "${m.evidence.term}" x${m.evidence.occurrences} across ${m.evidence.files.length} files`,
		);
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
