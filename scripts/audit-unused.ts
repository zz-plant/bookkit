import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isReleasedStatus } from "../packages/astro-bookkit/src/schemas/status";
import { extractBookStatusFromSource } from "../packages/astro-bookkit/src/validators/frame-config";
import { listBookDirs, optionalArg, repoRoot } from "./_lib";
import { exitOnHelp } from "./lib/cli";
import {
	listContentFiles,
	parseFrontmatter,
	toStringValue,
} from "./lib/content-frontmatter";

exitOnHelp({
	summary:
		"Lists, per book, mechanisms with no toolkit action or example, and\nactions or examples whose mechanism is missing or unknown. A draft book\nmay still lack actions and examples; a published or stable book may not.",
	usage: ["bun run audit:unused [--book <book>] [--release]"],
	options: [
		["--book <book>", "One book (default: every book)"],
		[
			"--release",
			"Hold a draft to the published rule too (bookkit publish does)",
		],
	],
	notes:
		"Exits 1 on a missing or unknown mechanism, and, in a published or\nstable book, on a mechanism without an action or example. verify runs it\nfor every book a change touches, and bookkit publish runs it with --release.",
	examples: ["bun run audit:unused", "bun run audit:unused -- --book on-call"],
});

const onlyBook = optionalArg("--book");
const releaseRules = process.argv.includes("--release");
const books = onlyBook ? [onlyBook] : listBookDirs();

if (books.length === 0) {
	console.error("No books found under apps/*");
	process.exit(1);
}

let issueCount = 0;

for (const book of books) {
	const bookRoot = join(repoRoot(), "apps", book, "src", "content", "book");
	const configPath = join(repoRoot(), "apps", book, "src", "book.config.ts");
	const status =
		(existsSync(configPath)
			? extractBookStatusFromSource(readFileSync(configPath, "utf8"))
			: undefined) ?? "draft";
	// A draft is expected to have mechanisms it has not written tools or
	// examples for yet; a published or stable book is not.
	const released = releaseRules || isReleasedStatus(status);
	const mechanismFiles = listContentFiles(join(bookRoot, "mechanisms"));
	const toolFiles = listContentFiles(join(bookRoot, "toolkit"));
	const exampleFiles = listContentFiles(join(bookRoot, "examples"));

	const mechanisms = new Set<string>();
	for (const file of mechanismFiles) {
		const { data, hasFrontmatter } = parseFrontmatter(
			readFileSync(file, "utf8"),
		);
		const slug =
			toStringValue(data.slug) || basename(file).replace(/\.(md|mdx)$/i, "");
		if (hasFrontmatter && slug) mechanisms.add(slug);
	}

	const toolsByMechanism = new Map<string, string[]>();
	const toolsMissingMechanism: string[] = [];

	for (const file of toolFiles) {
		const { data } = parseFrontmatter(readFileSync(file, "utf8"));
		const mechanism = toStringValue(data.mechanism);
		if (!mechanism) {
			toolsMissingMechanism.push(file);
			continue;
		}
		const list = toolsByMechanism.get(mechanism) ?? [];
		list.push(file);
		toolsByMechanism.set(mechanism, list);
	}

	const examplesByMechanism = new Map<string, string[]>();
	const examplesMissingMechanism: string[] = [];

	for (const file of exampleFiles) {
		const { data } = parseFrontmatter(readFileSync(file, "utf8"));
		const mechanism = toStringValue(data.mechanism);
		if (!mechanism) {
			examplesMissingMechanism.push(file);
			continue;
		}
		const list = examplesByMechanism.get(mechanism) ?? [];
		list.push(file);
		examplesByMechanism.set(mechanism, list);
	}

	const mechanismsWithoutTools = [...mechanisms].filter(
		(slug) => !toolsByMechanism.has(slug),
	);
	const mechanismsWithoutExamples = [...mechanisms].filter(
		(slug) => !examplesByMechanism.has(slug),
	);
	const toolsWithMissingMechanism = [...toolsByMechanism.keys()].filter(
		(slug) => !mechanisms.has(slug),
	);
	const examplesWithMissingMechanism = [...examplesByMechanism.keys()].filter(
		(slug) => !mechanisms.has(slug),
	);

	if (
		mechanismsWithoutTools.length === 0 &&
		mechanismsWithoutExamples.length === 0 &&
		toolsMissingMechanism.length === 0 &&
		examplesMissingMechanism.length === 0 &&
		toolsWithMissingMechanism.length === 0 &&
		examplesWithMissingMechanism.length === 0
	) {
		console.log(`\n${book}: no issues found.`);
		continue;
	}

	let note = "";
	if (!released) {
		note =
			": mechanisms without tools or examples are still to write, not failures";
	} else if (!isReleasedStatus(status)) {
		note = ", checked as published";
	}
	console.log(`\n${book} (${status}${note}):`);
	reportList("Mechanisms without tools", mechanismsWithoutTools);
	reportList("Mechanisms without examples", mechanismsWithoutExamples);
	reportList("Tools missing mechanism frontmatter", toolsMissingMechanism);
	reportList(
		"Examples missing mechanism frontmatter",
		examplesMissingMechanism,
	);
	reportList("Tools referencing unknown mechanisms", toolsWithMissingMechanism);
	reportList(
		"Examples referencing unknown mechanisms",
		examplesWithMissingMechanism,
	);

	issueCount +=
		(released
			? mechanismsWithoutTools.length + mechanismsWithoutExamples.length
			: 0) +
		toolsMissingMechanism.length +
		examplesMissingMechanism.length +
		toolsWithMissingMechanism.length +
		examplesWithMissingMechanism.length;
}

process.exit(issueCount === 0 ? 0 : 1);

function reportList(title: string, items: string[]) {
	if (items.length === 0) return;
	console.log(`- ${title}:`);
	for (const item of items) console.log(`  - ${item}`);
}
