import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { defaultFrames } from "../../packages/astro-bookkit/src/frames/defaults";
import { didYouMean } from "../../packages/astro-bookkit/src/utils/did-you-mean";
import { scaffoldSource } from "../../packages/astro-bookkit/src/validators/content-check";
import { listFilesRecursive } from "../_lib";
import { syncShimTemplatesToBook } from "../_shim-templates";

/**
 * Creates a book app from the engine's starter template
 * (packages/astro-bookkit/templates/starter/), the shims every book shares
 * (templates/book-app/), and placeholder content. `bun run new:book` and
 * create-bookkit both call this, so an in-repo book and a standalone project
 * start from the same files. Nothing here reads another book.
 */

export const STARTER_CONTENT_SECTIONS = [
	"chapters",
	"examples",
	"glossary",
	"mechanisms",
	"releases",
	"toolkit",
] as const;

export const starterTemplateRootIn = (root: string) =>
	join(root, "packages", "astro-bookkit", "templates", "starter");

/** Slugs of the placeholder records, prefixed with the book so two new books never share one. */
export const starterSlugs = (book: string) => {
	const mechanism = `${book}-starter-mechanism`;
	return {
		mechanism,
		tool: `${mechanism}--starter-tool`,
		glossary: `${book}-starter-term`,
	};
};

export const titleFromSlug = (slug: string): string =>
	slug
		.split("-")
		.filter(Boolean)
		.map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
		.join(" ");

export type ScaffoldBookOptions = {
	/** The workspace: holds apps/ and the engine at packages/astro-bookkit. */
	root: string;
	slug: string;
	title: string;
	/** Leave the content folders empty (default false). */
	skipStarterContent?: boolean;
	/** The frame's slug (default intervention), as `bookkit try` detected it. */
	frame?: string;
	/** Date of the starter release note, YYYY-MM-DD (default today). */
	today?: string;
};

export type ScaffoldBookResult = {
	appDir: string;
	/** Every file written, relative to `root`. */
	files: string[];
};

/** Fills the template's placeholders; in code the title is escaped for a double-quoted string. */
const fillTemplate = (
	source: string,
	file: string,
	values: { slug: string; title: string },
): string => {
	const title = /\.(ts|astro|json|jsonc|mjs)$/.test(file)
		? JSON.stringify(values.title).slice(1, -1)
		: values.title;
	return source
		.replaceAll("__BOOK_SLUG__", values.slug)
		.replaceAll("__BOOK_TITLE__", title);
};

/** The starter template's files for a book, keyed by path in its app folder. */
export const starterAppFiles = (
	root: string,
	slug: string,
	title: string,
): Record<string, string> => {
	const templateDir = starterTemplateRootIn(root);
	return Object.fromEntries(
		listFilesRecursive(templateDir).map((file) => [
			file,
			fillTemplate(readFileSync(join(templateDir, file), "utf8"), file, {
				slug,
				title,
			}),
		]),
	);
};

/** A frame by slug; no slug is the template's, intervention. */
export const frameNamed = (slug = "intervention") => {
	const frame = defaultFrames.find((candidate) => candidate.slug === slug);
	if (!frame) {
		const slugs = defaultFrames.map((candidate) => candidate.slug);
		throw new Error(
			`No frame "${slug}".${didYouMean(slug, slugs)} Frames: ${slugs.join(", ")}.`,
		);
	}
	return frame;
};

/** book.config.ts with the template's frame (intervention) swapped for `frame`. */
const withFrame = (
	source: string,
	frame: (typeof defaultFrames)[number],
): string => {
	if (frame.slug === "intervention") return source;
	const block = /(frame: \{\s*slug: )"intervention",(\s*steps: )\[[^\]]*\]/;
	if (!block.test(source)) {
		throw new Error(
			"The starter book.config.ts has no frame block to set; set frame in book.config.ts by hand.",
		);
	}
	return source.replace(
		block,
		`$1"${frame.slug}",$2[${frame.steps.map((step) => JSON.stringify(step.id)).join(", ")}]`,
	);
};

export const scaffoldBook = (
	options: ScaffoldBookOptions,
): ScaffoldBookResult => {
	const { root, slug, title } = options;
	const appDir = join(root, "apps", slug);
	const frame = frameNamed(options.frame);
	const templateDir = starterTemplateRootIn(root);
	if (!existsSync(templateDir)) {
		throw new Error(
			`Starter template not found at ${templateDir}. The engine at packages/astro-bookkit is missing or older than this script.`,
		);
	}
	if (existsSync(appDir)) {
		throw new Error(
			`apps/${slug} already exists. Pick another slug, or remove that book first (bun run remove:book -- --book ${slug}).`,
		);
	}

	const files: string[] = [];
	const write = (path: string, content: string) => {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content, "utf8");
		files.push(relative(root, path).split(sep).join("/"));
	};

	for (const [file, content] of Object.entries(
		starterAppFiles(root, slug, title),
	)) {
		write(
			join(appDir, file),
			file === join("src", "book.config.ts")
				? withFrame(content, frame)
				: content,
		);
	}
	for (const file of syncShimTemplatesToBook(slug, root)) {
		files.push(`apps/${slug}/${file}`);
	}

	const contentRoot = join(appDir, "src", "content", "book");
	for (const section of STARTER_CONTENT_SECTIONS) {
		mkdirSync(join(contentRoot, section), { recursive: true });
	}
	write(
		join(contentRoot, "README.md"),
		`# Content for ${title}

Each folder holds one kind of record. \`bun run bookkit contract <section>\` lists the fields each needs.

- \`chapters/\`: prose. \`00-overview.mdx\` carries a heading for each step of the frame in book.config.ts.
- \`mechanisms/\`: named patterns, each with a definition, what it is and is not, and predictions.
- \`toolkit/\`: actions of ten minutes or less, each tied to a mechanism.
- \`examples/<mechanism>/\`: replaceable illustrations of a mechanism.
- \`glossary/\`: terms the book uses.
- \`releases/\`: dated release notes.
`,
	);
	if (!options.skipStarterContent) {
		for (const [path, content] of Object.entries(
			starterContent(slug, title, options.today, frame.slug),
		)) {
			write(join(contentRoot, path), content);
		}
	}

	return { appDir, files: files.sort() };
};

/** Placeholder content for a new book, keyed by path under src/content/book/. */
export const starterContent = (
	book: string,
	title: string,
	today = new Date().toISOString().slice(0, 10),
	frameSlug?: string,
): Record<string, string> => {
	const slugs = starterSlugs(book);
	const frame = frameNamed(frameSlug);
	const overviewBody = frame.steps
		.map(
			(step) =>
				`## ${step.label}\n\nWrite the ${step.label.toLowerCase()} step of the book here.\n`,
		)
		.join("\n");
	return {
		"chapters/00-overview.mdx": `${scaffoldSource(
			"chapter",
			{
				slug: "overview",
				title: "Overview",
				mechanisms: [slugs.mechanism],
				status: "draft",
			},
			`The ${frame.name.toLowerCase()} frame (book.config.ts) needs one heading per step in this chapter: ${frame.steps.map((step) => step.id).join(", ")}.`,
		)}\n${overviewBody}`,
		[`mechanisms/${slugs.mechanism}.mdx`]: scaffoldSource(
			"mechanism",
			{ slug: slugs.mechanism, title: "Starter mechanism", status: "draft" },
			"A placeholder: rename the file and slug to the mechanism's own name, or delete it once the book has a real one.",
		),
		[`toolkit/${slugs.tool}.mdx`]: scaffoldSource(
			"tool",
			{
				slug: slugs.tool,
				mechanism: slugs.mechanism,
				name: "Starter tool",
				timeboxMinutes: 10,
				status: "draft",
			},
			"A placeholder action for the starter mechanism. Keep it runnable in ten minutes by someone with no spare energy.",
		),
		[`examples/${slugs.mechanism}/starter-example.mdx`]: scaffoldSource(
			"example",
			{ mechanism: slugs.mechanism, title: "Starter example", status: "draft" },
			"A placeholder example. It illustrates the mechanism without defining it, so replacing it leaves the mechanism standing.",
		),
		[`glossary/${slugs.glossary}.mdx`]: scaffoldSource(
			"glossary",
			{ slug: slugs.glossary, term: "Starter term", status: "draft" },
			"A placeholder term. Define each term the book relies on in one entry like this.",
		),
		[`releases/${today}-initial-draft.mdx`]: `---
title: "Initial draft"
version: "0.1.0"
date: "${today}"
summary: ${JSON.stringify(`Starts the first draft of ${title}.`)}
highlights:
  - "Added the overview chapter."
  - "Added one placeholder mechanism, tool, example, and glossary term."
---

Rewrite this note before the first release.
`,
	};
};

/**
 * Formats files with the workspace's Biome, so a new book passes `bun run
 * lint` and `check:format` as written. Returns a warning to print when Biome
 * is missing (a standalone project has none, and no format gate) or fails.
 */
export const formatWithBiome = (
	root: string,
	paths: string[],
): string | null => {
	const biome = join(root, "node_modules", ".bin", "biome");
	if (paths.length === 0) return null;
	if (!existsSync(biome)) {
		return "Biome is not installed here, so the new files were left unformatted.";
	}
	// The paths are explicit, so Biome needs no .gitignore to choose files.
	const result = spawnSync(
		biome,
		[
			"format",
			"--write",
			"--vcs-enabled=false",
			"--no-errors-on-unmatched",
			...paths,
		],
		{ cwd: root, encoding: "utf8" },
	);
	return result.status === 0
		? null
		: `Biome could not format the new files; run bun run format.\n${result.stdout}${result.stderr}`;
};
