import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
	closest,
	didYouMean,
} from "../../packages/astro-bookkit/src/utils/did-you-mean";
import { repoRoot } from "../_lib";

/**
 * Small conveniences behind the `bookkit` command, so a mistyped name gets a
 * suggestion, the book being worked on is remembered, and a missing argument
 * is asked for instead of failing. Everything here degrades to the plain
 * behavior when stdin is not a terminal, so agents and scripts see the same
 * usage errors as before.
 */

// Defined in the engine, whose validators suggest names too.
export { closest, didYouMean };

const localStatePath = () => join(repoRoot(), ".bookkit", "local.json");

type LocalState = { book?: string };

const readLocalState = (): LocalState => {
	try {
		return existsSync(localStatePath())
			? (JSON.parse(readFileSync(localStatePath(), "utf8")) as LocalState)
			: {};
	} catch {
		return {};
	}
};

/** The book set with `bookkit use`, if it still exists. Kept in .bookkit/ (gitignored). */
export const readFocusBook = (books: readonly string[]): string | undefined => {
	const book = readLocalState().book;
	return book && books.includes(book) ? book : undefined;
};

export const writeFocusBook = (book: string | undefined): void => {
	mkdirSync(join(repoRoot(), ".bookkit"), { recursive: true });
	writeFileSync(
		localStatePath(),
		`${JSON.stringify({ ...readLocalState(), book }, null, 2)}\n`,
	);
};

/** Whether a person is at the keyboard (prompts are only offered then). */
export const isInteractive = (): boolean =>
	Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** Asks for a line of text; undefined when not interactive or left empty. */
export const ask = (question: string): string | undefined => {
	if (!isInteractive()) return undefined;
	const answer = prompt(`${question}`)?.trim();
	return answer ? answer : undefined;
};

/**
 * Asks the person to pick one of `choices` by number or name. Accepts a close
 * misspelling. Undefined when not interactive or nothing matched.
 */
export const choose = (
	question: string,
	choices: ReadonlyArray<{ value: string; label?: string }>,
): string | undefined => {
	if (!isInteractive() || choices.length === 0) return undefined;
	console.log(question);
	choices.forEach((choice, index) => {
		console.log(
			`  ${String(index + 1).padStart(2)}. ${choice.value}${choice.label ? `  ${choice.label}` : ""}`,
		);
	});
	const answer = prompt("Number or name:")?.trim();
	if (!answer) return undefined;
	const index = Number(answer);
	if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
		return choices[index - 1].value;
	}
	const values = choices.map((choice) => choice.value);
	return values.includes(answer) ? answer : closest(answer, values);
};

/**
 * A command's help, printed for `-h` or `--help`: what it does, how to call
 * it, its arguments and options, and examples. Every script and `bookkit`
 * command prints one through `formatUsage`, so they all read alike.
 */
export type Usage = {
	/** What it does, in a sentence or two. */
	summary: string;
	/** How to call it, one line per form. */
	usage: readonly string[];
	/** Each argument or option and what it does; `-h, --help` is added. */
	options?: ReadonlyArray<readonly [string, string]>;
	/** What else to know: what it reads or writes, what it needs. */
	notes?: string;
	examples: readonly string[];
};

const indent = (lines: readonly string[]) =>
	lines.map((line) => `  ${line}`).join("\n");

export const formatUsage = ({
	summary,
	usage,
	options = [],
	notes,
	examples,
}: Usage): string => {
	const rows = [...options, ["-h, --help", "Show this help"] as const];
	const width = Math.min(30, Math.max(...rows.map(([name]) => name.length)));
	const pad = " ".repeat(width + 2);
	const option = ([name, meaning]: readonly [string, string]) => {
		const text = meaning.replace(/\n/g, `\n  ${pad}`);
		return name.length > width
			? `${name}\n  ${pad}${text}`
			: `${name.padEnd(width)}  ${text}`;
	};
	return [
		summary,
		`Usage:\n${indent(usage)}`,
		`Options:\n${indent(rows.map(option))}`,
		...(notes ? [notes] : []),
		`Examples:\n${indent(examples)}`,
	].join("\n\n");
};

/** Whether the arguments ask for help: `-h` or `--help`, before any `--`. */
export const wantsHelp = (
	argv: readonly string[] = process.argv.slice(2),
): boolean => {
	const end = argv.indexOf("--");
	return (end < 0 ? argv : argv.slice(0, end)).some(
		(arg) => arg === "--help" || arg === "-h",
	);
};

/**
 * Prints the usage and exits 0 when the arguments ask for help. A script
 * calls it before anything else, so `--help` never reads a book, writes a
 * file, or starts a server.
 */
export const exitOnHelp = (
	usage: Usage | string,
	argv: readonly string[] = process.argv.slice(2),
): void => {
	if (!wantsHelp(argv)) return;
	console.log(typeof usage === "string" ? usage : formatUsage(usage));
	process.exit(0);
};

type ArgKind = "string" | "boolean";
type ArgValue<K extends ArgKind> = K extends "string" ? string : boolean;

export type ParsedScriptArgs<
	S extends Record<string, ArgKind>,
	R extends keyof S,
> = { [K in R]: ArgValue<S[K]> } & {
	[K in Exclude<keyof S, R>]?: ArgValue<S[K]>;
};

/**
 * Reads a script's `--flag value` arguments. `--help`/`-h` prints `usage` and
 * exits 0. An unknown flag, a flag missing its value, a stray positional, or a
 * missing required flag prints what is wrong and the usage, and exits 1.
 */
export const parseScriptArgs = <
	S extends Record<string, ArgKind>,
	R extends keyof S & string = never,
>(
	usage: Usage | string,
	spec: S,
	required: readonly R[] = [],
	argv: string[] = process.argv.slice(2),
): ParsedScriptArgs<S, R> => {
	// Help first, so `--help` beside a mistyped flag still prints it.
	exitOnHelp(usage, argv);
	const result = readScriptArgs(spec, required, argv);
	if (!("values" in result)) {
		const text = typeof usage === "string" ? usage : formatUsage(usage);
		console.error("error" in result ? `${result.error}\n\n${text}` : text);
		process.exit(1);
	}
	return result.values;
};

/**
 * For a script that reads its own arguments: the first `--flag` (or
 * `--flag=value`) that is not one of `flags`, as `readScriptArgs` words it
 * ("Unknown option --aply. Did you mean --apply?"); undefined when every
 * flag is known. The word after one of `valueFlags` is its value, never a
 * flag.
 */
export const unknownFlagError = (
	argv: readonly string[],
	flags: readonly string[],
	valueFlags: readonly string[] = [],
): string | undefined => {
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index].split("=")[0];
		if (!flag.startsWith("-") || flag === "-" || flag === "--") continue;
		if (!flags.includes(flag)) {
			return `Unknown option ${flag}.${didYouMean(flag, flags)}`;
		}
		if (valueFlags.includes(flag) && !argv[index].includes("=")) index += 1;
	}
	return undefined;
};

/** `parseScriptArgs` without the printing and exiting, for tests. */
export const readScriptArgs = <
	S extends Record<string, ArgKind>,
	R extends keyof S & string = never,
>(
	spec: S,
	required: readonly R[],
	argv: string[],
): { values: ParsedScriptArgs<S, R> } | { error: string } | { help: true } => {
	const flags = Object.keys(spec).map((name) => `--${name}`);
	let values: Record<string, string | boolean | undefined>;
	try {
		values = parseArgs({
			args: argv,
			options: {
				...Object.fromEntries(
					Object.entries(spec).map(([name, type]) => [name, { type }]),
				),
				help: { type: "boolean", short: "h" },
			},
			strict: true,
			allowPositionals: false,
		}).values;
	} catch (error) {
		const code = (error as { code?: string }).code;
		const token =
			(error instanceof Error ? error.message : "").match(
				/'(-[^' ]+|[^']+)'/,
			)?.[1] ?? "";
		if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
			const flag = token.split("=")[0];
			return {
				error: `Unknown option ${flag}.${didYouMean(flag, flags)}`,
			};
		}
		if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
			const flag = token.split(" ")[0];
			return {
				error: /does not take an argument/.test(String(error))
					? `${flag} takes no value.`
					: `${flag} needs a value.`,
			};
		}
		if (code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL") {
			return {
				error: `Unexpected argument "${token}". A value goes right after its flag: --name value.`,
			};
		}
		return { error: error instanceof Error ? error.message : String(error) };
	}
	if (values.help) return { help: true };
	const missing = required.filter((name) => values[name] === undefined);
	if (missing.length > 0) {
		return {
			error: `Missing ${missing.map((name) => `--${name} <${name}>`).join(", ")}.`,
		};
	}
	const empty = Object.entries(values).find(
		([name, value]) => spec[name] === "string" && value === "",
	);
	if (empty) return { error: `--${empty[0]} needs a value.` };
	delete values.help;
	return { values: values as ParsedScriptArgs<S, R> };
};

/** Exits with the available books (and the closest one) unless `book` is an app in apps/. */
export const requireExistingBook = (
	book: string,
	books: readonly string[],
): void => {
	if (books.includes(book)) return;
	console.error(
		`No book "${book}" in apps/.${didYouMean(book, books)} Books: ${books.join(", ") || "none yet (create one with bun run new:book -- --book <slug>)"}.`,
	);
	process.exit(1);
};

/** Exits naming the book's mechanisms unless `mechanism` is one of them. */
export const requireExistingMechanism = (
	book: string,
	mechanism: string,
	mechanisms: readonly string[],
): void => {
	if (mechanisms.includes(mechanism)) return;
	console.error(
		`${book} has no mechanism "${mechanism}".${didYouMean(mechanism, mechanisms)} Its mechanisms: ${mechanisms.join(", ") || "none yet"}. To add one: bun run new:mechanism -- --book ${book} --slug <slug>.`,
	);
	process.exit(1);
};
