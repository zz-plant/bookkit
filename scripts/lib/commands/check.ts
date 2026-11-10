import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { checkBookContent } from "../../../packages/astro-bookkit/src/validators/book-validator";
import {
	CONTENT_SECTIONS,
	type ContentSection,
	contentContract,
	isContentSection,
} from "../../../packages/astro-bookkit/src/validators/content-check";
import { repoRoot, slugify } from "../../_lib";
import { flagValue } from "../cli";
import { compileFinding, compileMdx } from "../compile-mdx";
import {
	isBookContentPath,
	printFolderCheck,
	printTry,
	readFolder,
	resolveFromCaller,
	runPreview,
} from "../folder-report";
import { RELEASE_FIELDS, releaseSource } from "../release-notes";
import { checkOneFile } from "./check-file";
import {
	args,
	books,
	focusBook,
	requireBook,
	runScript,
	targetBooks,
} from "./context";
import { usageOf } from "./help";

/**
 * `bookkit check` for a book, every book, or a folder, and `validate`,
 * `try`, and `contract`. One content file is checked in ./check-file.ts.
 */

/**
 * `check [book|file|folder]`: one content file, a folder of Markdown, or a
 * book's structure, its mechanisms across books, and suggestions.
 */
export async function checkCommand() {
	if (args[1] && /\.mdx?$/.test(args[1]) && isBookContentPath(args[1])) {
		await checkOneFile(
			args[1],
			args.includes("--json"),
			args.includes("--quick"),
		);
		return;
	}
	// Any other file or folder: check it where it is, without a book app.
	// A bare name that is no path stays a book name, so typos get suggestions.
	const target = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
	if (
		target &&
		!books.includes(target) &&
		(existsSync(resolveFromCaller(target)) || /[\\/]|\.mdx?$/.test(target))
	) {
		// A folder of a book's content is checked as part of the book.
		if (isBookContentPath(target) && !args.includes("--frame")) {
			process.exit(await checkBookFolder(target, args.includes("--json")));
		}
		checkFolder(target, args.slice(2));
		return;
	}
	// No book: the current one (bookkit use), unless --all.
	const book =
		args[1] && !args[1].startsWith("--")
			? args[1]
			: args.includes("--all")
				? undefined
				: (focusBook ?? undefined);
	if (book) requireBook(book, "bun run bookkit check [book] [--all]");
	if (book && book === focusBook && args[1] !== book) {
		console.log(`(${book} is the current book; add --all for every book.)`);
	}
	const quick = args.includes("--quick");
	console.log(`\n🔎 Structure${book ? ` of ${book}` : " of every book"}\n`);
	const structure = book
		? runScript("validate-book.ts", ["--book", book])
		: runScript("validate-all.ts", []);
	console.log(
		`\n🔎 Mechanisms across books${quick ? " (wording only)" : " (meaning and wording)"}\n`,
	);
	const corpus = runScript("check-corpus.ts", [
		"--mode",
		"error",
		...(book ? ["--book", book] : []),
		...(quick ? ["--no-semantic"] : []),
		...(args.includes("--download-model") ? ["--download-model"] : []),
	]);
	// What a reader would trip on that is not an error: ideas named in
	// prose but not bound, mechanisms no chapter uses, terms that recur.
	if (book) {
		console.log("\n🔎 Suggestions (advisory; nothing here blocks publishing)");
		runScript("check-suggestions.ts", [
			book,
			...(args.includes("--info") ? ["--info"] : []),
		]);
	}
	console.log(
		`\n${structure === 0 ? "✓" : "✗"} structure  ${corpus === 0 ? "✓" : "✗"} mechanisms across books`,
	);
	if (corpus !== 0) {
		console.log(
			'  → For each cluster above: one idea, bun run bookkit merge <keep> <drop> --reason "<why>"; or different ideas, bun run bookkit rule <a> <b> --distinct "<reason>".',
		);
	}
	process.exit(structure === 0 && corpus === 0 ? 0 : 1);
}

/** `validate [book] [--all]`: structure only. */
export function validateCommand() {
	// As check and build: the named book, else the current one, unless --all.
	const target = targetBooks(args, "bun run bookkit validate [book] [--all]");
	const flags = args
		.slice(args[1] && !args[1].startsWith("--") ? 2 : 1)
		.filter((arg) => arg !== "--all");
	const [one] = target.books;
	if (target.note) console.log(target.note);
	process.exit(
		target.books.length === 1
			? runScript("validate-book.ts", ["--book", one, ...flags])
			: runScript("validate-all.ts", flags),
	);
}

/**
 * `try <folder> [--frame <slug>] [--json]`: what Bookkit would make of a
 * folder of Markdown.
 */
export function tryCommand() {
	// The folder may come before or after the flags.
	const target = args
		.slice(1)
		.find(
			(arg, index, list) =>
				!arg.startsWith("--") && list[index - 1] !== "--frame",
		);
	if (!target) {
		console.error(`Name the folder of Markdown to read.\n\n${usageOf("try")}`);
		process.exit(1);
	}
	const folder = readFolder(target);
	if ("error" in folder) {
		console.error(folder.error);
		process.exit(1);
	}
	const preview = runPreview(folder.files, {
		frame: flagValue(args, "--frame"),
		name: slugify(target.split(/[\\/]/).filter(Boolean).pop() ?? "folder"),
	});
	if (args.includes("--json")) console.log(JSON.stringify(preview, null, 2));
	else printTry(target, preview, folder.files);
	process.exit(0);
}

/**
 * `contract [section] [--json]`: the fields a content section, or a release
 * note, needs.
 */
export function contractCommand() {
	const requested = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
	// Release notes are not a content section; their page reads these fields.
	if (requested === "release") {
		const template = releaseSource({
			title: "First edition",
			version: "0.1.0",
			date: new Date().toISOString().slice(0, 10),
		});
		if (args.includes("--json")) {
			console.log(
				JSON.stringify(
					{
						section: "release",
						directory: "releases",
						fields: RELEASE_FIELDS,
						template,
					},
					null,
					2,
				),
			);
			return;
		}
		console.log("\nrelease  (src/content/book/releases/)");
		for (const field of RELEASE_FIELDS) {
			console.log(
				`  ${field.name.padEnd(18)} ${field.whenMissing.padEnd(9)} ${field.meaning}`,
			);
		}
		console.log(
			`\n  A note the page lists (bun run bookkit new release "<title>" writes one):\n${template.replace(/^/gm, "    ")}`,
		);
		return;
	}
	if (requested !== undefined && !isContentSection(requested)) {
		console.error(
			`Unknown section "${requested}". Use one of: ${CONTENT_SECTIONS.join(", ")}, or release.`,
		);
		process.exit(1);
	}
	const sections: ContentSection[] = requested
		? [requested]
		: [...CONTENT_SECTIONS];
	const contracts = sections.map((section) => contentContract(section));
	if (args.includes("--json")) {
		console.log(JSON.stringify(contracts, null, 2));
		return;
	}
	for (const contract of contracts) {
		console.log(
			`\n${contract.section}  (src/content/book/${contract.directory}/)`,
		);
		for (const field of contract.fields) {
			console.log(
				`  ${field.name.padEnd(18)} ${field.whenMissing.padEnd(9)} ${field.meaning}`,
			);
		}
		console.log(
			`\n  A file that compiles:\n${contract.template.replace(/^/gm, "    ")}`,
		);
	}
}

/**
 * `check <folder>` for a folder of a book's content: the book's own checks
 * (its frame, status, references, and the MDX compiler), reporting only the
 * files in the folder. A folder outside a book goes to `checkFolder`.
 */
async function checkBookFolder(
	target: string,
	asJson: boolean,
): Promise<number> {
	const absolute = resolveFromCaller(target);
	const book = relative(repoRoot(), absolute).match(/^apps\/([^/]+)\//)?.[1];
	if (!book || !books.includes(book)) {
		console.error(`${target} is not in a book under apps/.`);
		return 1;
	}
	const inFolder = (file: string | undefined) =>
		Boolean(file) &&
		(file === absolute || (file as string).startsWith(`${absolute}/`));
	const content = checkBookContent({
		workspaceRoot: repoRoot(),
		bookSlug: book,
	});
	const findings = content.findings.filter((finding) => inFolder(finding.file));
	const files = statSync(absolute).isDirectory()
		? readdirSync(absolute, { recursive: true })
				.map(String)
				.filter((file) => /\.mdx?$/.test(file))
				.map((file) => join(absolute, file))
		: [absolute];
	// The compiler the build uses, unless an HTML comment already explains why it fails.
	for (const file of files.filter((path) => path.endsWith(".mdx"))) {
		if (
			findings.some(
				(finding) =>
					finding.file === file && finding.code === "MDX_HTML_COMMENT",
			)
		) {
			continue;
		}
		const compiled = compileFinding(
			await compileMdx(
				readFileSync(file, "utf8"),
				join(repoRoot(), "apps", book),
			),
		);
		if (compiled)
			findings.push({ ...compiled, file } as (typeof findings)[number]);
	}
	const errors = findings.filter((finding) => finding.level === "error").length;
	if (asJson) {
		console.log(
			JSON.stringify(
				{
					book,
					folder: relative(repoRoot(), absolute),
					files: files.length,
					ok: errors === 0,
					findings: findings.map((finding) => ({
						...finding,
						file: finding.file ? relative(repoRoot(), finding.file) : undefined,
					})),
				},
				null,
				2,
			),
		);
		return errors === 0 ? 0 : 1;
	}
	console.log(
		`\n${errors === 0 ? "✓" : "✗"} ${relative(repoRoot(), absolute)}: ${files.length} file(s), checked as part of ${book}${content.releaseMode ? " (release rules)" : ""}`,
	);
	for (const file of files.sort()) {
		const own = findings.filter((finding) => finding.file === file);
		if (own.length === 0) continue;
		const failed = own.some((finding) => finding.level === "error");
		console.log(
			`  ${failed ? "✗" : "!"} ${relative(absolute, file) || relative(repoRoot(), file)}`,
		);
		for (const finding of own) {
			console.log(`      ${finding.level}: ${finding.message}`);
			if (finding.fix) console.log(`        fix: ${finding.fix}`);
		}
	}
	console.log(
		`\n  ${errors} error(s), ${findings.length - errors} warning(s). The whole book: bun run bookkit check ${book}`,
	);
	return errors === 0 ? 0 : 1;
}

/** `check <folder|file>` outside a book app: the folder preview as a gate. */
function checkFolder(target: string, rest: string[]) {
	const folder = readFolder(target);
	if ("error" in folder) {
		console.error(folder.error);
		process.exit(1);
	}
	const frame = flagValue(rest, "--frame");
	const preview = runPreview(folder.files, {
		frame,
		requireFrameSteps: Boolean(frame),
		releaseMode: rest.includes("--release"),
	});
	if (rest.includes("--json")) {
		console.log(
			JSON.stringify({ ok: preview.errors === 0, ...preview }, null, 2),
		);
	} else {
		printFolderCheck(target, preview);
	}
	process.exit(preview.errors === 0 ? 0 : 1);
}
