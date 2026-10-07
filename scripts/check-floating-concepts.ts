import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { parseFrontmatter, toStringValue } from "./lib/content-frontmatter";

const { values } = parseArgs({
	args: Bun.argv,
	options: {
		book: { type: "string" },
		mode: { type: "string", default: "warn" },
	},
	strict: false,
	allowPositionals: true,
});

// With strict: false, a flag given without a value parses as `true`.
const mode = typeof values.mode === "string" ? values.mode : "warn";

// Match multi-word Title Case phrases (2-4 capitalized words) representing potential named concepts.
// Hyphens are treated as word separators so "On-Call Runbook" is one phrase, not "Call Runbook".
const multiWordConcept = /\b([A-Z][a-z]+(?:(?:\s+|-)[A-Z][a-z]+){1,3})\b/g;

const COMMON_ALLOWLIST = new Set([
	"Table Of Contents",
	"Reading Hub",
	"Release Notes",
	"Getting Started",
	"Primary Mechanisms",
	"Secondary Mechanisms",
	"Core Mechanisms",
	"Action Primitives",
	"Next Steps",
	"Next Move",
	"Insight Modules",
	"First Edition",
	"Initial Draft",
	"Draft Instance",
	"Bad People",
	"Running Hot",
	"The Crumple Zone",
	"Crumple Zone",
	"Creative Commons",
	"Public Domain",
	"MIT License",
	"Apache License",
	"United States",
	"European Union",
	"New York",
	"San Francisco",
]);

function walk(dir: string, out: string[] = []) {
	if (!existsSync(dir)) return out;
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, ent.name);
		if (ent.isDirectory()) walk(p, out);
		else if (ent.isFile() && (p.endsWith(".md") || p.endsWith(".mdx")))
			out.push(p);
	}
	return out;
}

function normalizeTerm(term: string): string {
	return term.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

function loadRegisteredVocabulary(bookRoot: string): Set<string> {
	const vocabulary = new Set<string>();

	// The book's own title and slug (from book.config.ts) are registered labels.
	const bookConfigPath = join(bookRoot, "../../book.config.ts");
	if (existsSync(bookConfigPath)) {
		const configSource = readFileSync(bookConfigPath, "utf8");
		const configTitle = configSource.match(/title:\s*"([^"]+)"/)?.[1];
		const configSlug = configSource.match(/slug:\s*"([^"]+)"/)?.[1];
		if (configTitle) vocabulary.add(normalizeTerm(configTitle));
		if (configSlug) vocabulary.add(normalizeTerm(configSlug));
	}

	// Chapters (their titles are what TOC prose and cross-references repeat).
	const chapterDir = join(bookRoot, "chapters");
	for (const file of walk(chapterDir)) {
		const { data } = parseFrontmatter(readFileSync(file, "utf8"));
		const title = toStringValue(data.title) || toStringValue(data.slug);
		if (title) vocabulary.add(normalizeTerm(title));
	}

	// Mechanisms
	const mechanismDir = join(bookRoot, "mechanisms");
	for (const file of walk(mechanismDir)) {
		const { data } = parseFrontmatter(readFileSync(file, "utf8"));
		const slug =
			toStringValue(data.slug) || basename(file).replace(/\.(md|mdx)$/, "");
		const title = toStringValue(data.title);
		if (slug) vocabulary.add(normalizeTerm(slug));
		if (title) vocabulary.add(normalizeTerm(title));
	}

	// Glossary
	const glossaryDir = join(bookRoot, "glossary");
	for (const file of walk(glossaryDir)) {
		const { data } = parseFrontmatter(readFileSync(file, "utf8"));
		const term =
			toStringValue(data.term) ||
			toStringValue(data.title) ||
			basename(file).replace(/\.(md|mdx)$/, "");
		if (term) vocabulary.add(normalizeTerm(term));
	}

	// Toolkit
	const toolkitDir = join(bookRoot, "toolkit");
	for (const file of walk(toolkitDir)) {
		const { data } = parseFrontmatter(readFileSync(file, "utf8"));
		const name = toStringValue(data.name) || toStringValue(data.title);
		if (name) vocabulary.add(normalizeTerm(name));
	}

	// Releases (their titles appear in release-note prose).
	const releasesDir = join(bookRoot, "releases");
	for (const file of walk(releasesDir)) {
		const { data } = parseFrontmatter(readFileSync(file, "utf8"));
		const title = toStringValue(data.title);
		if (title) vocabulary.add(normalizeTerm(title));
	}

	// Examples (their titles are formal labels, not floating concepts).
	const examplesDir = join(bookRoot, "examples");
	for (const file of walk(examplesDir)) {
		const { data } = parseFrontmatter(readFileSync(file, "utf8"));
		const title = toStringValue(data.title);
		if (title) vocabulary.add(normalizeTerm(title));
	}

	return vocabulary;
}

async function discoverBooks(): Promise<string[]> {
	if (typeof values.book === "string") {
		return [values.book];
	}

	const appsDir = join(process.cwd(), "apps");
	try {
		const entries = await readdir(appsDir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		console.error("❌ Fatal: Could not find the 'apps' directory.");
		process.exit(1);
	}
}

async function checkConceptsForBook(book: string): Promise<number> {
	const base = join(process.cwd(), "apps", book, "src", "content", "book");
	if (!existsSync(base)) {
		throw new Error(`Missing content directory for ${book} at ${base}`);
	}

	const vocabulary = loadRegisteredVocabulary(base);
	const registeredTerms = [...vocabulary];
	const files = walk(base);
	const hits: Record<string, Set<string>> = {};

	for (const file of files) {
		const content = readFileSync(file, "utf8");
		const { body } = parseFrontmatter(content);

		// Skip code blocks and headings for concept extraction
		const cleanedBody = body
			.replace(/```[\s\S]*?```/g, "")
			.replace(/`[^`]+`/g, "")
			.replace(/^#+\s+.*$/gm, "")
			// "Source:" lines cite external essays; provenance is not concept usage.
			.replace(/Source: [^.\n]*\.?/g, "");

		let match = multiWordConcept.exec(cleanedBody);
		while (match !== null) {
			const term = match[1].trim();
			match = multiWordConcept.exec(cleanedBody);
			if (COMMON_ALLOWLIST.has(term)) continue;

			const normalized = normalizeTerm(term);
			if (vocabulary.has(normalized)) continue;

			// A phrase that is part of a registered title (e.g. a chapter title
			// repeated in the overview TOC, or a hyphenated book title) is not a
			// floating concept.
			if (registeredTerms.some((t) => t.includes(normalized))) continue;

			let fileHits = hits[file];
			if (!fileHits) {
				fileHits = new Set();
				hits[file] = fileHits;
			}
			fileHits.add(term);
		}
	}

	let bookCount = 0;
	for (const [file, terms] of Object.entries(hits)) {
		if (terms.size === 0) continue;
		bookCount += terms.size;
		console.log(`\n[${book}] ${file}`);
		for (const term of [...terms].sort()) {
			console.log(`  - "${term}" (unregistered concept)`);
		}
	}

	return bookCount;
}

async function main() {
	const books = await discoverBooks();

	if (books.length === 0) {
		console.error(
			"No books found under apps/. Pass --book <slug> to target a specific book.",
		);
		process.exit(1);
	}

	let totalCount = 0;

	for (const book of books) {
		console.log(`\n🔍 Checking concept registry: ${book}`);
		try {
			totalCount += await checkConceptsForBook(book);
		} catch (error) {
			console.error(`❌ Issues found in ${book}: ${(error as Error).message}`);
		}
	}

	if (totalCount === 0) {
		console.log("\n✅ All multi-word concepts are registered or in allowlist.");
		process.exit(0);
	}

	console.log(
		`\nFound ${totalCount} unregistered multi-word concept phrases across books.`,
	);
	console.log(
		"Tip: If these are formal concepts, register them in glossary/ or mechanisms/.",
	);

	if (mode === "error") {
		console.error("❌ Concept validation failed in error mode.");
		process.exit(1);
	}

	process.exit(0);
}

main();
