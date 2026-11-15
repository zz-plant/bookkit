import { parseArgs } from "node:util";

const slugify = (text: string): string =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

const didYouMean = (flag: string, flags: string[]): string => {
	const bare = flag.replace(/^--?/, "");
	let best: { candidate: string; score: number } | undefined;
	for (const candidate of flags) {
		const c = candidate.replace(/^--?/, "");
		const min = Math.min(bare.length, c.length);
		let shared = 0;
		for (let i = 0; i < min; i += 1) {
			if (bare[i] === c[i]) shared += 1;
		}
		if (shared >= 2 && (!best || shared > best.score)) {
			best = { candidate, score: shared };
		}
	}
	return best ? ` Did you mean ${best.candidate}?` : "";
};

const formatUsage = (help: {
	summary: string;
	usage: string[];
	options: Array<[string, string]>;
	notes?: string;
	examples?: string[];
}): string => {
	const pad = Math.max(...help.options.map(([flag]) => flag.length)) + 2;
	const lines = [
		help.summary,
		"",
		"Usage:",
		...help.usage.map((u) => `  ${u}`),
		"",
		"Options:",
		...help.options.map(
			([flag, desc]) =>
				`  ${flag.padEnd(pad)}${desc.replace(/\n/g, `\n${" ".repeat(pad + 2)}`)}`,
		),
	];
	if (help.notes) lines.push("", help.notes);
	if (help.examples?.length) {
		lines.push("", "Examples:", ...help.examples.map((e) => `  ${e}`));
	}
	return lines.join("\n");
};

export const USAGE = formatUsage({
	summary:
		"Creates a standalone Bookkit project: one book app, the engine vendored\ninto packages/astro-bookkit/, and the bookkit CLI and checks in\nscripts/. Works from a clone of bookkit or via bunx create-bookkit;\n<folder> must be outside the source repository.",
	usage: [
		'create-bookkit <folder> [--book <slug>] [--title "<title>"] [--dir <markdown-folder>] [--force] [--source <repo>] [--ref <git-ref>]',
		"create-bookkit <folder> --upgrade [--source <repo>] [--ref <git-ref>]",
	],
	options: [
		["--book <slug>", "The book's slug (default: from the folder name)"],
		['--title "<title>"', "The book's title (default: from the slug)"],
		[
			"--dir <folder>",
			"Import a folder of Markdown as chapters (runs bun install\nfirst)",
		],
		[
			"--force",
			"Create the project in a folder that already has files.\nNothing there is overwritten: if a file the project needs\nexists, it lists it and stops.",
		],
		[
			"--upgrade",
			"Replace an existing project's engine, scripts, and shared\nwrappers with this repository's. Lists every file it\nchanges; never writes content or book.config.ts.",
		],
		[
			"--source <dir>",
			"Path to a local bookkit repository checkout to vendor from",
		],
		[
			"--ref <git-ref>",
			"Branch or tag of bookkit to shallow-clone when no local\nsource checkout is present",
		],
	],
	notes:
		"Inside a bookkit clone, bun run create-bookkit runs packages/create-bookkit/src/index.ts.",
	examples: [
		'bunx create-bookkit my-book --title "My Book"',
		"bun run create-bookkit ../field-notes --dir ~/notes/field",
		"bun run create-bookkit ../my-book --upgrade",
	],
});

export type CreateArgs = {
	target: string;
	book?: string;
	title?: string;
	dir?: string;
	force: boolean;
	upgrade: boolean;
	source?: string;
	ref?: string;
};

const OPTIONS = {
	book: { type: "string" },
	title: { type: "string" },
	dir: { type: "string" },
	force: { type: "boolean" },
	upgrade: { type: "boolean" },
	source: { type: "string" },
	ref: { type: "string" },
	help: { type: "boolean", short: "h" },
} as const;

/** Reads create-bookkit's arguments; never exits, so it can be tested. */
export const parseCreateArgs = (
	argv: string[],
): { values: CreateArgs } | { error: string } | { help: true } => {
	let parsed: {
		values: {
			book?: string;
			title?: string;
			dir?: string;
			force?: boolean;
			upgrade?: boolean;
			source?: string;
			ref?: string;
			help?: boolean;
		};
		positionals: string[];
	};
	try {
		parsed = parseArgs({
			args: argv,
			options: OPTIONS,
			strict: true,
			allowPositionals: true,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const flag = message.match(/'(--?[^' =]+)/)?.[1] ?? "";
		const code = (error as { code?: string }).code;
		if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
			const flags = Object.keys(OPTIONS).map((name) => `--${name}`);
			return { error: `Unknown option ${flag}.${didYouMean(flag, flags)}` };
		}
		if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
			return {
				error: /does not take an argument/.test(message)
					? `${flag} takes no value.`
					: `${flag} needs a value.`,
			};
		}
		return { error: message };
	}
	const { values, positionals } = parsed;
	if (values.help) return { help: true };
	if (positionals.length === 0) {
		return { error: "Missing the project folder." };
	}
	if (positionals.length > 1) {
		return {
			error: `Expected one project folder, got ${positionals.length}: ${positionals.join(", ")}. Quote a title that has spaces: --title "My Book".`,
		};
	}
	for (const name of ["book", "title", "dir", "source", "ref"] as const) {
		if (values[name] === "") return { error: `--${name} needs a value.` };
	}
	if (values.upgrade) {
		const extra = (["book", "title", "dir", "force"] as const).filter(
			(name) => values[name] !== undefined,
		);
		if (extra.length > 0) {
			return {
				error: `--upgrade replaces the engine's files only, so it takes no ${extra.map((name) => `--${name}`).join(", ")}.`,
			};
		}
	}
	if (values.book !== undefined && slugify(values.book) !== values.book) {
		return {
			error: `--book "${values.book}" is not a slug. Use lowercase words joined by hyphens, e.g. --book ${slugify(values.book) || "field-notes"}.`,
		};
	}
	return {
		values: {
			target: positionals[0],
			book: values.book,
			title: values.title,
			dir: values.dir,
			force: values.force ?? false,
			upgrade: values.upgrade ?? false,
			...(values.source !== undefined ? { source: values.source } : {}),
			...(values.ref !== undefined ? { ref: values.ref } : {}),
		},
	};
};
