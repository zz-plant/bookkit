import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { defaultFrames } from "../../packages/astro-bookkit/src/frames/defaults";
import {
	type FolderPreview,
	type FolderSourceFile,
	previewFolder,
} from "../../packages/astro-bookkit/src/proposals";
import { listBookDirs, repoRoot, slugify } from "../_lib";

/**
 * `bookkit try <dir>` and `bookkit check <dir>`: Bookkit on a folder it does
 * not own. Both read Markdown wherever it is and write nothing; `try` shows
 * what the folder would become, `check` is the same analysis as a gate.
 */

const SKIP = new Set(["node_modules", ".git", "dist", ".astro"]);

const FRAME_CHOICES = defaultFrames.map((frame) => frame.slug);

/**
 * Resolves a path the user typed. `bun run` starts scripts at the repo root
 * and overwrites PWD, so relative paths start at the repo root unless the
 * runner says otherwise (npm's INIT_CWD).
 */
export const resolveFromCaller = (path: string): string =>
	resolve(process.env.INIT_CWD ?? process.cwd(), path);

const listMarkdown = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		if (entry.name.startsWith(".") || SKIP.has(entry.name)) return [];
		const full = join(dir, entry.name);
		if (entry.isDirectory()) return listMarkdown(full);
		return /\.mdx?$/i.test(entry.name) ? [full] : [];
	});

/** The Markdown under a folder (or one file), with paths relative to it. */
export const readFolder = (
	target: string,
): { root: string; files: FolderSourceFile[] } | { error: string } => {
	const absolute = resolveFromCaller(target);
	if (!existsSync(absolute)) {
		return {
			error: `No such file or folder: ${absolute}\nRelative paths start at the repo root (bun run runs there); give an absolute path for anything else.`,
		};
	}
	const single = statSync(absolute).isFile();
	// One file keeps the two folders above it, so toolkit/x.mdx still reads as
	// a tool (examples nest one deeper: examples/<mechanism>/x.mdx).
	const root = single ? resolve(absolute, "..", "..", "..") : absolute;
	const paths = single ? [absolute] : listMarkdown(absolute);
	if (paths.length === 0) {
		return { error: `No Markdown (.md or .mdx) files under ${target}` };
	}
	return {
		root,
		files: paths.map((path) => ({
			path: relative(root, path),
			source: readFileSync(path, "utf8"),
		})),
	};
};

/** True for a path inside a book app's content tree, which `check <file>` already handles with the book's context. */
export const isBookContentPath = (target: string): boolean =>
	/^apps\/[^/]+\/src\/content\/book\//.test(
		relative(repoRoot(), resolveFromCaller(target)),
	);

/** Runs the preview, or exits with the reason (an unknown frame names the known ones). */
export const runPreview = (
	files: FolderSourceFile[],
	options: Parameters<typeof previewFolder>[1],
): FolderPreview => {
	try {
		return previewFolder(files, options);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
};

const plural = (n: number, word: string, many = `${word}s`) =>
	`${n.toLocaleString("en-US")} ${n === 1 ? word : many}`;

/** A book in this workspace built on the same frame, to show what the folder would become. */
const sampleBook = (frame: string): string | undefined => {
	const preferred: Record<string, string> = {
		runbook: "on-call",
		intervention: "running-hot",
	};
	const books = listBookDirs();
	const book = preferred[frame];
	return book && books.includes(book) ? book : undefined;
};

const describeSections = (preview: FolderPreview): string => {
	const { chapter, mechanism, tool, example, glossary } = preview.sections;
	const contract = [
		mechanism ? plural(mechanism, "mechanism") : "",
		tool ? plural(tool, "tool") : "",
		example ? plural(example, "example") : "",
		glossary ? plural(glossary, "glossary entry", "glossary entries") : "",
	].filter(Boolean);
	const prose = chapter ? plural(chapter, "prose document") : "";
	return [prose, ...contract].filter(Boolean).join(", ");
};

const printFindings = (preview: FolderPreview, onlyFailing: boolean) => {
	for (const finding of preview.findings) {
		console.log(`  ${finding.level}: ${finding.message}`);
		if (finding.fix) console.log(`    fix: ${finding.fix}`);
	}
	for (const doc of preview.documents) {
		if (doc.findings.length === 0) {
			if (!onlyFailing) console.log(`  ✓ ${doc.path}`);
			continue;
		}
		const failed = doc.findings.some((finding) => finding.level === "error");
		console.log(`  ${failed ? "✗" : "!"} ${doc.path}`);
		for (const finding of doc.findings) {
			console.log(`      ${finding.level}: ${finding.message}`);
			if (finding.fix) {
				console.log(`        fix: ${finding.fix.replace(/\n/g, "\n        ")}`);
			}
		}
	}
};

export const printTry = (target: string, preview: FolderPreview) => {
	const label = target.replace(/\/$/, "");
	console.log(`\nBOOKKIT TRY · ${label}  (read-only: nothing was written)\n`);
	console.log(
		`  ${plural(preview.files, "file")}, ${plural(preview.words, "word")}: ${describeSections(preview)}`,
	);

	// The shape: which frame, and how much of it the documents already carry.
	const { frame } = preview;
	const prose = preview.documents.filter((doc) => doc.section === "chapter");
	const confidence = Math.round((frame.confidence ?? 0) * 100);
	const how =
		frame.source === "given"
			? "as you asked"
			: confidence >= 75
				? `detected from the wording, ${confidence}% of the signals`
				: `a guess: only ${confidence}% of the wording points this way`;
	console.log(`\nShape: ${frame.name} (${how})`);
	if (frame.source === "detected") {
		console.log(
			`  Another shape: --frame ${FRAME_CHOICES.filter((slug) => slug !== frame.slug).join(" | ")}`,
		);
	}
	if (prose.length > 0) {
		console.log(
			frame.stepsPer === "document"
				? '  Every document needs a section for each step: a heading or a "Label:" line whose words start like the step.'
				: '  The book as a whole needs each step: a heading or a "Label:" line anywhere counts.',
		);
		const width = Math.max(...frame.steps.map((step) => step.label.length));
		for (const step of frame.steps) {
			const mark = step.documents > 0 ? "✓" : "✗";
			console.log(
				`    ${mark} ${step.label.padEnd(width)}  ${frame.stepsPer === "document" ? `${step.documents} of ${prose.length}` : plural(step.documents, "document")}`,
			);
		}
		if (frame.stepsPer === "document") {
			const incomplete = prose.filter(
				(doc) => doc.frameSteps.missing.length > 0,
			);
			console.log(
				incomplete.length === 0
					? "  Every document already has every section."
					: `  ${incomplete.length} of ${prose.length} would fail a ${frame.slug} check today.`,
			);
		} else if (frame.missing.length > 0) {
			console.log(`  Missing anywhere: ${frame.missing.join(", ")}.`);
		}
	}

	if (preview.concepts.length > 0) {
		console.log(
			"\nIdeas that recur (named across documents; register each once, then every document binds to it)",
		);
		const width = Math.max(...preview.concepts.map((c) => c.term.length));
		for (const concept of preview.concepts) {
			console.log(
				`  ${concept.term.padEnd(width)}  ${plural(concept.occurrences, "time")} in ${plural(concept.files.length, "document")}`,
			);
		}
	} else if (prose.length > 1) {
		console.log(
			"\nIdeas that recur: none named in Title Case across documents yet.",
		);
	}

	if (preview.overlaps.length > 0) {
		console.log("\nMechanisms that read alike");
		for (const overlap of preview.overlaps) console.log(`  ${overlap.message}`);
	}

	const contract = preview.documents.filter((doc) => doc.contract);
	if (contract.length > 0 || preview.findings.length > 0) {
		const clean = contract.filter((doc) => doc.findings.length === 0).length;
		console.log(
			`\nAgainst the content contract: ${clean} of ${plural(contract.length, "file")} pass`,
		);
		printFindings({ ...preview, documents: contract }, true);
	}

	const needsMdx = prose.filter(
		(doc) =>
			doc.mdx &&
			doc.mdx.htmlComments + doc.mdx.braces + doc.mdx.autolinks + doc.mdx.tags >
				0,
	);
	if (needsMdx.length > 0) {
		console.log(
			`\n${plural(needsMdx.length, "document")} ${needsMdx.length === 1 ? "uses" : "use"} {braces}, <tags>, HTML comments, or <autolinks>; import converts them so they compile as MDX.`,
		);
	}

	const slug = slugify(basename(resolveFromCaller(target))) || "my-book";
	const title = slug
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
	const sample = sampleBook(frame.slug);
	console.log("\nWhat it would become");
	console.log(
		"  · a site with search, a PDF, and an EPUB, built from this folder",
	);
	console.log(
		`  · a CI check that fails a pull request when a document loses a section:\n      bun run bookkit check ${label} --frame ${frame.slug}`,
	);
	console.log(
		"  · an MCP server agents can read, and check their drafts against",
	);
	if (sample) {
		console.log(
			`  See a book built on the same frame: bun run bookkit dev ${sample}`,
		);
	}
	const isBook = preview.documents.some(
		(doc) => doc.contract && doc.section === "chapter",
	);
	if (!isBook) {
		console.log(
			`\nMake it a book (writes apps/${slug}/; your folder is untouched)`,
		);
		console.log(`  bun run bookkit new-book --book ${slug} --title "${title}"`);
		console.log(`  bun run bookkit import --book ${slug} --dir ${label}`);
		console.log(`  bun run bookkit propose --book ${slug}`);
	}
	console.log("");
};

export const printFolderCheck = (target: string, preview: FolderPreview) => {
	const ok = preview.errors === 0;
	console.log(
		`\n${ok ? "✓" : "✗"} ${target}: ${plural(preview.files, "file")}${preview.frame.source === "given" ? `, ${preview.frame.slug} frame` : ""}`,
	);
	printFindings(preview, true);
	console.log(
		`\n  ${plural(preview.errors, "error")}, ${plural(preview.warnings, "warning")}`,
	);
	if (preview.frame.source !== "given" && preview.sections.chapter > 0) {
		console.log(
			`  Sections were not checked. Add --frame ${preview.frame.slug} to require them (see: bun run bookkit try ${target}).`,
		);
	}
};
