import { parseArgs } from "node:util";
import { slugify } from "../../../scripts/_lib";
import { didYouMean } from "../../../scripts/lib/cli";

export const USAGE = `Create a standalone Bookkit project: one book app, the engine vendored into
packages/astro-bookkit/, and the bookkit CLI and checks in scripts/.

Usage:
  bun run packages/create-bookkit/src/index.ts <folder> [--book <slug>] [--title "<title>"] [--dir <markdown-folder>] [--force]
  bun run packages/create-bookkit/src/index.ts <folder> --upgrade

Run it from a clone of the bookkit repository; <folder> must be outside it.

Options:
  --book <slug>       The book's slug (default: from the folder name)
  --title "<title>"   The book's title (default: from the slug)
  --dir <folder>      Import a folder of Markdown as chapters (runs bun install first)
  --force             Create the project in a folder that already has files. Nothing
                      there is overwritten: if a file the project needs exists, it
                      lists it and stops.
  --upgrade           Replace an existing project's engine, scripts, and shared
                      wrappers with this repository's. Lists every file it changes;
                      never writes content or book.config.ts.
  -h, --help          Show this help`;

export type CreateArgs = {
	target: string;
	book?: string;
	title?: string;
	dir?: string;
	force: boolean;
	upgrade: boolean;
};

const OPTIONS = {
	book: { type: "string" },
	title: { type: "string" },
	dir: { type: "string" },
	force: { type: "boolean" },
	upgrade: { type: "boolean" },
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
	for (const name of ["book", "title", "dir"] as const) {
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
		},
	};
};
