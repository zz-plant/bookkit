import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { isReleasedStatus } from "../../../packages/astro-bookkit/src/schemas/status";
import { readBookStatus } from "../../../packages/astro-bookkit/src/validators/book-validator";
import { listFilesRecursive, repoRoot } from "../../_lib";
import { choose, flagValue } from "../cli";
import {
	DEFAULT_DEV_PORT,
	foregroundServer,
	runDevServer,
	stopForegroundServer,
} from "../dev-server";
import { resolveFromCaller } from "../folder-report";
import { draftRecords, publishedRecord, withBookStatus } from "../publish-book";
import { releaseVersions } from "../release-notes";
import { exportRubric } from "../rubric";
import {
	args,
	bookChoices,
	books,
	exitCodeOf,
	focusBook,
	requireBook,
	runScript,
	targetBooks,
} from "./context";

/** Preview and publish: `bookkit dev`, `build`, `export`, and `publish`. */

/**
 * `dev [book] [--port <n>]`, and `dev stop|status|logs [book]`: the local
 * preview server.
 */
export async function devCommand() {
	if (books.length === 0) {
		console.error("No books found in apps/*");
		process.exit(1);
	}
	// `bookkit dev` stays in the foreground. These control a server that
	// `astro dev` moved to the background itself (it does under an AI agent);
	// Astro's own `astro dev stop` only works inside the app.
	const control = ["stop", "status", "logs"].includes(args[1] ?? "")
		? args[1]
		: undefined;
	const usage = "bun run bookkit dev [book] [--port <n>]";
	const named = control ? args[2] : args[1];
	const targetBook =
		named && !named.startsWith("--")
			? requireBook(named, usage)
			: (focusBook ??
				(books.length === 1
					? books[0]
					: choose("Which book?", bookChoices())) ??
				books[0]);
	if (control) {
		// First the server `bookkit dev` runs in another terminal.
		const running = foregroundServer(targetBook);
		if (running && control === "stop") {
			stopForegroundServer(running, targetBook);
			console.log(
				`Stopped the dev server for ${targetBook} on port ${running.port}.`,
			);
			process.exit(0);
		}
		if (running && control === "status") {
			console.log(
				`The dev server for ${targetBook} is running: http://localhost:${running.port}/ (bun run bookkit dev stop ${targetBook} stops it).`,
			);
			process.exit(0);
		}
		if (running) {
			console.log(
				`The dev server for ${targetBook} runs in the foreground of another terminal; its log is there.`,
			);
			process.exit(0);
		}
		// Then one astro dev moved to the background itself. Astro answers
		// in JSON when it detects an agent; print just its message.
		const result = spawnSync("bunx", ["--bun", "astro", "dev", control], {
			cwd: join(repoRoot(), "apps", targetBook),
			stdio: ["inherit", "pipe", "inherit"],
		});
		for (const line of result.stdout?.toString().split("\n") ?? []) {
			if (!line.trim()) continue;
			try {
				const parsed = JSON.parse(line) as { message?: unknown };
				console.log(typeof parsed.message === "string" ? parsed.message : line);
			} catch {
				console.log(line);
			}
		}
		process.exit(exitCodeOf(result, `astro dev ${control}`));
	}
	const portArg = flagValue(args, "--port");
	const port = args.includes("--port") ? Number(portArg) : DEFAULT_DEV_PORT;
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		console.error(
			`--port needs a whole number from 1 to 65535${portArg ? `, not "${portArg}"` : ""}.\nUsage: ${usage}`,
		);
		process.exit(1);
	}
	console.log(`\n🚀 Starting dev server for ${targetBook}...\n`);
	process.exit(await runDevServer(targetBook, port));
}

/** `build [book] [--all]`: one book, or every workspace book. */
export async function buildCommand() {
	const target = targetBooks(args, "bun run bookkit build [book] [--all]");
	const targetBook = target.books.length === 1 ? target.books[0] : undefined;
	if (targetBook) {
		if (target.note) console.log(target.note);
		console.log(`\n📦 Building @books/${targetBook}...\n`);
		const { status, warnings } = await buildWithWarnings(targetBook);
		// After Astro's log, where the book went and what to do with it.
		const dist = join("apps", targetBook, "dist");
		const exportsDir = join(repoRoot(), dist, "exports");
		if (status === 0) {
			const files = ["book.pdf", "book.epub"].filter((file) =>
				existsSync(join(exportsDir, file)),
			);
			console.log(
				`\n✓ Built ${targetBook} in ${dist}${files.length > 0 ? `; ${files.map((file) => join(dist, "exports", file)).join(" and ")}` : ""}.`,
			);
			// Export warnings scroll past in Astro's log; repeat them here.
			if (warnings.length > 0) {
				console.log(
					`\n⚠ ${warnings.length} export warning(s): the PDF or EPUB differs from the site here.`,
				);
				for (const warning of warnings.slice(0, 5)) {
					console.log(`  ${warning}`);
				}
				if (warnings.length > 5) {
					console.log(`  … and ${warnings.length - 5} more above`);
				}
			}
			console.log(
				`Next: bun run bookkit deploy ${targetBook} --dry-run rehearses publishing it.`,
			);
		}
		process.exit(status);
	} else {
		console.log("\n📦 Building all workspace books...\n");
		const result = spawnSync(
			process.execPath,
			["run", "--workspaces", "build"],
			{ cwd: repoRoot(), stdio: "inherit" },
		);
		process.exit(exitCodeOf(result, "the build"));
	}
}

/**
 * `export [book] [--out <dir>] [--rubric]`: a GitBook folder of the book, or
 * its corpus as an eval rubric.
 */
export function exportCommand() {
	const target = targetBooks(
		args,
		"bun run bookkit export [book] [--out <dir>] [--rubric]",
	);
	if (target.books.length !== 1) {
		console.error(
			`Name the book to export (bun run bookkit export <book>), or set one with bun run bookkit use <book>. Books: ${books.join(", ")}`,
		);
		process.exit(1);
	}
	const [book] = target.books;
	if (target.note) console.log(target.note);
	const out = flagValue(args, "--out");
	if (args.includes("--rubric")) {
		const written = exportRubric(book, out && resolveFromCaller(out));
		if ("error" in written) {
			console.error(written.error);
			process.exit(1);
		}
		const { rubric } = written;
		const same = rubric.pairs.filter((pair) => pair.label === "same_idea");
		const shown = relative(process.cwd(), written.path);
		console.log(
			`Rubric for ${rubric.books.join(", ")} (version ${rubric.version}): ${rubric.criteria.length} criteria, ${
				rubric.pairs.length > 0
					? `${rubric.pairs.length} labelled pairs (${same.length} same idea, ${rubric.pairs.length - same.length} distinct, with reasons)`
					: "no labelled pairs yet (bookkit rule and bookkit merge add them)"
			}.\nWritten to ${shown.startsWith("..") ? written.path : shown}`,
		);
		process.exit(0);
	}
	console.log(`\n📚 GitBook export of ${book}\n`);
	const status = runScript("export-gitbook.ts", [
		"--book",
		book,
		...(out ? ["--out", resolveFromCaller(out)] : []),
	]);
	// The PDF and EPUB come from the build.
	const exportsDir = join("apps", book, "dist", "exports");
	const built = ["book.pdf", "book.epub"].filter((file) =>
		existsSync(join(repoRoot(), exportsDir, file)),
	);
	// A build older than the book's latest edit no longer shows it.
	const builtAt =
		built.length > 0
			? Math.min(
					...built.map(
						(file) => statSync(join(repoRoot(), exportsDir, file)).mtimeMs,
					),
				)
			: 0;
	const srcDir = join(repoRoot(), "apps", book, "src");
	const edited = existsSync(srcDir)
		? listFilesRecursive(srcDir).filter(
				(file) => statSync(join(srcDir, file)).mtimeMs > builtAt,
			)
		: [];
	console.log(
		built.length === 0
			? `\nThe PDF and EPUB come from the build: bun run bookkit build ${book} writes them to ${exportsDir}/.`
			: edited.length > 0
				? `\nThe PDF and EPUB in ${exportsDir}/ are from a build older than ${edited.length} edited file(s) (${edited.slice(0, 2).join(", ")}${edited.length > 2 ? ", …" : ""}): bun run bookkit build ${book} remakes them.`
				: `\nPDF and EPUB from the last build, current with the book: ${built.map((file) => join(exportsDir, file)).join(", ")}.`,
	);
	process.exit(status);
}

/**
 * Builds one book in its folder, passing its output through, and collects
 * the export warnings (an image the PDF or EPUB shows as alt text, text a
 * font cannot draw) for the summary.
 */
async function buildWithWarnings(
	book: string,
): Promise<{ status: number; warnings: string[] }> {
	const child = Bun.spawn([process.execPath, "run", "build"], {
		cwd: join(repoRoot(), "apps", book),
		stdin: "inherit",
		stdout: "inherit",
		stderr: "pipe",
	});
	const warnings: string[] = [];
	const decoder = new TextDecoder();
	let pending = "";
	const collect = (line: string) => {
		const match = line.match(/\[bookkit\] ((?:PDF|EPUB) export: .*)$/);
		if (match) warnings.push(match[1]);
	};
	const reader = child.stderr.getReader();
	for (;;) {
		const { done, value: chunk } = await reader.read();
		if (done) break;
		process.stderr.write(chunk);
		pending += decoder.decode(chunk, { stream: true });
		const lines = pending.split("\n");
		pending = lines.pop() ?? "";
		for (const line of lines) collect(line);
	}
	collect(pending);
	const code = await child.exited;
	if (child.signalCode) {
		console.error(`The ${book} build was stopped by ${child.signalCode}.`);
		return { status: 1, warnings };
	}
	return { status: code, warnings };
}

/**
 * `publish [book] [--dry-run] [--records]`: the book checked with the release
 * rules it would be held to, then `status: "published"` in book.config.ts.
 * Nothing changes while an error stands. --records first marks the book's
 * draft records published, for an author who left them draft by default.
 */
export function publish(rest: string[]): number {
	const usage = "bun run bookkit publish [book] [--dry-run] [--records]";
	const unknown = rest.filter(
		(arg) => arg.startsWith("--") && !["--dry-run", "--records"].includes(arg),
	);
	if (unknown.length > 0) {
		console.error(`Unknown option ${unknown.join(", ")}.
Usage: ${usage}`);
		return 1;
	}
	const dryRun = rest.includes("--dry-run");
	const book = requireBook(
		rest.find((arg) => !arg.startsWith("--")),
		usage,
	);
	const configPath = join(repoRoot(), "apps", book, "src", "book.config.ts");
	const shownConfig = relative(repoRoot(), configPath);
	const status = readBookStatus(repoRoot(), book) ?? "draft";
	if (isReleasedStatus(status)) {
		console.log(
			`${book} is already ${status}. To put it online: bun run bookkit deploy ${book} --dry-run, then without --dry-run.`,
		);
		return 0;
	}
	if (!existsSync(configPath)) {
		console.error(`${shownConfig} is missing.`);
		return 1;
	}
	const nextConfig = withBookStatus(
		readFileSync(configPath, "utf8"),
		"published",
	);
	if (!nextConfig) {
		console.error(
			`${shownConfig} has no status: line to change. Add status: "published" to bookConfig yourself, then run bun run bookkit check ${book}.`,
		);
		return 1;
	}

	const drafts = draftRecords(book);
	const records = rest.includes("--records");
	// The records as they were, to put back if the book still fails.
	const originals = new Map<string, string>();
	if (records && drafts.length > 0) {
		for (const path of drafts) {
			const text = readFileSync(path, "utf8");
			originals.set(path, text);
			writeFileSync(path, publishedRecord(text));
		}
		console.log(
			`${dryRun ? "Checking" : "Marking"} ${drafts.length} draft record(s) as published (--records):`,
		);
		for (const path of drafts.slice(0, 10)) {
			console.log(`  ${relative(repoRoot(), path)}`);
		}
		if (drafts.length > 10) console.log(`  … and ${drafts.length - 10} more`);
	}

	console.log(
		`\n🔎 ${book} checked with the rules a published book is held to\n`,
	);
	const checked = runScript("validate-book.ts", ["--book", book, "--release"]);
	// A dry run, or a book that still fails, keeps its records as they were.
	if (checked !== 0 || dryRun) {
		for (const [path, text] of originals) writeFileSync(path, text);
	}
	if (checked !== 0) {
		console.log(
			[
				"",
				`Not published: fix the errors above; ${shownConfig} still says status: "${status}"${originals.size > 0 ? ", and the draft records are drafts again" : ""}.`,
				...(drafts.length > 0 && !records
					? [
							`${drafts.length} record(s) are drafts. If they are finished, bun run bookkit publish ${book} --records marks them published too.`,
						]
					: []),
			].join("\n"),
		);
		return 1;
	}
	if (dryRun) {
		console.log(
			`\nReady: nothing above blocks publishing. bun run bookkit publish ${book}${records ? " --records" : ""} sets status: "published" in ${shownConfig}.`,
		);
		return 0;
	}
	writeFileSync(configPath, nextConfig);
	const notes = releaseVersions(
		join(repoRoot(), "apps", book, "src", "content", "book", "releases"),
	);
	const next: Array<[string, string]> = [
		...(notes.length === 0
			? [
					[
						`bun run bookkit new release ${book} "First edition"`,
						"a release note readers see",
					] as [string, string],
				]
			: []),
		[`bun run bookkit deploy ${book} --dry-run`, "rehearse putting it online"],
		[`bun run bookkit deploy ${book}`, "put it online"],
	];
	const width = Math.max(...next.map(([command]) => command.length));
	console.log(
		[
			"",
			`Set status: "published" in ${shownConfig}. The site is now indexable (robots.txt and the sitemap open), and every check holds the book to release rules.`,
			"Next:",
			...next.map(([command, what]) => `  ${command.padEnd(width)}   ${what}`),
		].join("\n"),
	);
	return 0;
}
