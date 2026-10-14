import type { MdxConversion } from "../../packages/astro-bookkit/src/utils/markdown";
import { type FileAction, type ImportPlan, WRITES } from "./import-markdown";

const LISTED_LINKS = 10;

const ACTION_LABEL: Record<FileAction, [planned: string, done: string]> = {
	new: ["new", "new"],
	update: ["update", "updated"],
	unchanged: ["unchanged", "unchanged"],
	keep: ["keep", "kept"],
	replace: ["replace", "replaced"],
};

/** Chapters whose file would not compile, with where and why. */
export const compileFailures = (plan: ImportPlan) =>
	plan.chapters.filter(
		(chapter) => WRITES.has(chapter.action) && chapter.compile.ok === false,
	);

/**
 * What `bookkit import` prints, before writing (--dry-run) or after: each
 * note and the chapter it becomes, skipped files, rewritten links, copied
 * images, frontmatter left out, conversions, and problems to fix, each
 * naming the note and line.
 */
export const describeImport = (
	plan: ImportPlan,
	options: { dryRun: boolean; bookDir: string },
): string[] => {
	const lines: string[] = [];
	const verb = (action: FileAction) =>
		ACTION_LABEL[action][options.dryRun ? 0 : 1];
	const widest = (values: string[]) =>
		Math.max(0, ...values.map((v) => v.length));
	const sourceWidth = widest(plan.chapters.map((c) => c.source));
	const fileWidth = widest(plan.chapters.map((c) => c.file));
	const actionWidth = widest(plan.chapters.map((c) => verb(c.action)));

	lines.push(
		options.dryRun
			? `Dry run: nothing is written. Importing ${plan.sourceLabel} into ${options.bookDir} would do this:`
			: `Imported ${plan.sourceLabel} into ${options.bookDir}:`,
	);

	lines.push("", `Chapters, in reading order (${plan.chapters.length}):`);
	if (plan.chapters.length === 0) lines.push("  (no notes to import)");
	for (const chapter of plan.chapters) {
		const status = chapter.status === "draft" ? ", draft" : "";
		lines.push(
			`  ${verb(chapter.action).padEnd(actionWidth)}  ${chapter.source.padEnd(sourceWidth)}  → chapters/${chapter.file.padEnd(fileWidth)}  "${chapter.title}"${status}`,
		);
		if (chapter.action === "new" && chapter.reason) {
			lines.push(`      ${chapter.reason}`);
		} else if (chapter.action === "keep") {
			lines.push(
				`      ${chapter.reason}; ${options.dryRun ? "import would keep it" : "kept it"} (--force replaces it)`,
			);
		} else if (chapter.action === "replace") {
			lines.push(
				`      ${chapter.reason}; --force ${options.dryRun ? "would replace" : "replaced"} it`,
			);
		}
	}

	if (plan.skipped.length > 0) {
		lines.push("", `Skipped (${plan.skipped.length}):`);
		for (const { source, reason } of plan.skipped) {
			lines.push(`  ${source}: ${reason}`);
		}
	}

	if (plan.links.length > 0) {
		lines.push(
			"",
			`Links between notes now point at chapters (${plan.links.length}):`,
		);
		for (const link of plan.links.slice(0, LISTED_LINKS)) {
			lines.push(`  ${link.source}:${link.line}  ${link.from} → ${link.to}`);
		}
		if (plan.links.length > LISTED_LINKS) {
			lines.push(`  … and ${plan.links.length - LISTED_LINKS} more`);
		}
	}

	if (plan.images.length > 0) {
		lines.push("", `Images, copied to public/images/ (${plan.images.length}):`);
		for (const image of plan.images) {
			const note =
				image.action === "keep"
					? `  (${image.reason}; kept, --force replaces it)`
					: image.action === "replace"
						? `  (${image.reason}; replaced)`
						: "";
			lines.push(
				`  ${verb(image.action)}  ${image.source} → /images/${image.file}${note}`,
			);
		}
	}

	const leftOut = new Map<string, string[]>();
	for (const chapter of plan.chapters) {
		for (const field of chapter.leftOut) {
			leftOut.set(field, [...(leftOut.get(field) ?? []), chapter.source]);
		}
	}
	if (leftOut.size > 0) {
		lines.push(
			"",
			"Frontmatter fields chapters have no place for, left out of the chapter:",
		);
		for (const [field, sources] of leftOut) {
			lines.push(`  ${field}: ${sources.join(", ")}`);
		}
	}

	const total = (key: keyof MdxConversion) =>
		plan.chapters.reduce((sum, chapter) => sum + chapter.changes[key], 0);
	const conversions = [
		[total("html"), "HTML tag kept as HTML", "HTML tags kept as HTML"],
		[
			total("htmlComments"),
			"HTML comment made an MDX comment",
			"HTML comments made MDX comments",
		],
		[total("autolinks"), "<autolink> made a link", "<autolinks> made links"],
		[total("braces"), "brace escaped", "braces escaped"],
		[total("tags"), "tag-like < escaped", "tag-like < escaped"],
		[total("esm"), "import/export line escaped", "import/export lines escaped"],
	] as const;
	if (conversions.some(([count]) => count > 0)) {
		lines.push(
			"",
			`Converted so every chapter compiles as MDX: ${conversions
				.filter(([count]) => count > 0)
				.map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
				.join(", ")}.`,
		);
	}
	const asText = plan.chapters.filter((chapter) => chapter.htmlAsText);
	if (asText.length > 0) {
		lines.push(
			`Raw HTML is shown as text in ${asText.map((c) => c.source).join(", ")}: MDX could not compile it as HTML.`,
		);
	}

	if (plan.orphans.length > 0) {
		lines.push(
			"",
			"Imported earlier, but not part of this import (left as they are):",
		);
		for (const orphan of plan.orphans) {
			lines.push(`  chapters/${orphan.file} (from ${orphan.source})`);
		}
	}

	const failures = compileFailures(plan);
	// When the compiler is missing, no chapter is checked; say so once.
	const unchecked = plan.chapters.find(
		(chapter) => WRITES.has(chapter.action) && chapter.compile.ok === null,
	);
	const count = plan.problems.length + failures.length + (unchecked ? 1 : 0);
	if (count > 0) {
		lines.push("", `Problems to fix (${count}):`);
		for (const chapter of failures) {
			if (chapter.compile.ok !== false) continue;
			const { line, column, reason } = chapter.compile;
			const at = line ? `:${line}${column ? `:${column}` : ""}` : "";
			lines.push(
				`  ✗ ${options.bookDir}/src/content/book/chapters/${chapter.file}${at} (from ${chapter.source}) does not compile as MDX: ${reason}`,
			);
		}
		if (unchecked?.compile.ok === null) {
			lines.push(
				`  ! Chapters were not compiled to check them: ${unchecked.compile.reason}.`,
			);
		}
		for (const problem of plan.problems) {
			const at = problem.line ? `:${problem.line}` : "";
			lines.push(`  ! ${problem.source}${at}: ${problem.message}`);
		}
	} else {
		lines.push(
			"",
			`Every chapter ${options.dryRun ? "would compile" : "compiles"} as MDX, and every link between notes resolves.`,
		);
	}
	return lines;
};

/** Shell-quotes a path that has spaces or other specials. */
const shellQuote = (value: string) =>
	/^[\w@%+=:,./~-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;

/**
 * Commands that work for the book just imported. In this repo the bookkit
 * CLI runs them; a project made by create-bookkit has package scripts.
 */
export const nextSteps = (options: {
	book: string;
	sourceArg: string;
	dryRun: boolean;
	inRepo: boolean;
	force?: boolean;
	includeReadme?: boolean;
}): string[] => {
	const { book, inRepo } = options;
	const flags = [
		options.force && "--force",
		options.includeReadme && "--include-readme",
	].filter(Boolean);
	const importCommand = [
		inRepo ? `bun run bookkit import ${book}` : `bun run import --book ${book}`,
		`--dir ${shellQuote(options.sourceArg)}`,
		...flags,
	].join(" ");
	const steps: Array<[string, string]> = options.dryRun
		? [[importCommand, "run the import"]]
		: inRepo
			? [
					[
						`bun run bookkit propose ${book}`,
						"draft mechanisms and tools from ideas that recur",
					],
					[
						`bun run bookkit check ${book} --quick`,
						"what each file still needs, with fixes",
					],
					[`bun run bookkit dev ${book}`, "read it as a book"],
				]
			: [
					[
						`bun run suggest -- --book ${book}`,
						"drafts for mechanisms and tools from ideas that recur",
					],
					["bun run validate", "what each file still needs"],
					["bun run dev", "read it as a book"],
				];
	const width = Math.max(...steps.map(([command]) => command.length));
	const lines = ["", "Next:"];
	for (const [command, what] of steps) {
		lines.push(`  ${command.padEnd(width)}  ${what}`);
	}
	if (!options.dryRun) {
		lines.push(
			"",
			"Import writes chapters only. Mechanisms, tools, and glossary terms are yours to define.",
		);
	}
	return lines;
};
