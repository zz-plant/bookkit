import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../../_lib";
import { didYouMean, flagValue, positionals } from "../cli";
import { loadBookContent } from "../load-book";
import { planMerge, planSync } from "../merge-mechanisms";
import { applyChanges, books, printChanges, requireBook } from "./context";

/**
 * `bookkit merge` and `sync`: one mechanism, or one contract, in every book
 * of a corpus.
 */

/**
 * bookkit merge <keep> <drop> --reason "<why>": the author's ruling that two
 * mechanisms are one idea, carried out in every book of their corpus and
 * recorded in corpus.json (lib/merge-mechanisms.ts).
 */
export function merge(rest: string[]): number {
	const usage =
		'bun run bookkit merge <keep> <drop> --reason "<why they are one idea>" [--definition "<one sentence>"] [--dry-run]';
	const [keep, drop] = positionals(rest, ["--reason", "--definition"]);
	if (!keep || !drop) {
		console.error(
			`Usage: ${usage}\n<keep> stays, in every book that has either one; <drop> is folded into it.`,
		);
		return 1;
	}
	const reason = flagValue(rest, "--reason");
	if (!reason?.trim()) {
		console.error(
			"--reason needs why they are one idea, in your words: the lever and the evidence they share. corpus.json keeps it with both mechanisms as they were.",
		);
		console.error(`Usage: ${usage}`);
		return 1;
	}
	const definition = flagValue(rest, "--definition");
	const plan = planMerge({
		keep,
		drop,
		reason,
		definition,
		date: new Date().toISOString().slice(0, 10),
	});
	if ("error" in plan) {
		console.error(plan.error);
		return 1;
	}
	const dryRun = rest.includes("--dry-run");
	console.log(
		`${dryRun ? "Would merge" : "Merged"} ${drop} into ${keep} in ${plan.books.join(", ")}:`,
	);
	printChanges(plan.changes);
	console.log(
		`  ~ corpus.json: the merge, with both mechanisms as they were${plan.carried.length > 0 ? `; ${plan.carried.length} ruling(s) on ${drop} now on ${keep}` : ""}`,
	);
	const lists = (["is", "isNot", "predictions", "tests"] as const)
		.map((field) => `${field} ${plan.contract[field].length}`)
		.join(", ");
	console.log(
		`\nOne contract in every copy: ${definition ? "your definition" : `${keep}'s title and definition`}; both mechanisms' items, without repeats (${lists}).`,
	);
	for (const ruling of plan.carried) {
		console.log(
			`  Ruled distinct, carried over: ${ruling.pair.join(" ~ ")}: ${ruling.reason}`,
		);
	}
	if (plan.carried.length > 0) {
		console.log(`  Reread those reasons: they were written about ${drop}.`);
	}
	for (const note of plan.notes) console.log(`  ${note}`);
	if (plan.leftovers.length > 0) {
		console.log(`\nStill naming ${drop} (read these over):`);
		for (const left of plan.leftovers.slice(0, 12)) {
			console.log(`  ${left.path}:${left.line}  ${left.text}`);
		}
		if (plan.leftovers.length > 12) {
			console.log(`  … and ${plan.leftovers.length - 12} more`);
		}
	}
	if (dryRun) {
		console.log("\nNothing written (--dry-run).");
		return 0;
	}
	applyChanges(plan.changes);
	writeFileSync(plan.corpusPath, plan.corpusText);
	console.log(
		`\nLinks to ${drop}'s own pages (/read/mechanisms/${drop}) no longer resolve; for a published book, say so in its release notes.`,
	);
	console.log(
		`To change the shared contract later: edit it in one book, then bun run bookkit sync ${keep}.`,
	);
	console.log(
		"Next: bun run bookkit check, then commit the books and corpus.json together.",
	);
	return 0;
}

/**
 * `sync <slug> --to <book>`: the mechanism shared with a book that has no copy
 * of it: one copy's file (--from, else the one edited last) copied into the
 * book's mechanisms/, so check:corpus keeps the copies the same from then on.
 */
function shareMechanism(
	slug: string,
	to: string,
	from: string | undefined,
	dryRun: boolean,
): number {
	requireBook(to, "bun run bookkit sync <mechanism> --to <book>");
	const holders = books.flatMap((book) =>
		loadBookContent(book)
			.mechanisms.filter((m) => m.slug === slug && m.file)
			.map((m) => ({ book, file: m.file as string })),
	);
	if (holders.length === 0) {
		const slugs = [
			...new Set(
				books.flatMap((book) =>
					loadBookContent(book).mechanisms.map((m) => m.slug),
				),
			),
		];
		console.error(`No mechanism ${slug}.${didYouMean(slug, slugs)}`);
		return 1;
	}
	if (holders.some((holder) => holder.book === to)) {
		console.error(
			`${to} already has ${slug}. bun run bookkit sync ${slug} keeps its copies the same.`,
		);
		return 1;
	}
	if (from && !holders.some((holder) => holder.book === from)) {
		console.error(
			`${from} has no ${slug}; it is in ${holders.map((holder) => holder.book).join(", ")}.`,
		);
		return 1;
	}
	const source =
		holders.find((holder) => holder.book === from) ??
		[...holders].sort(
			(a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs,
		)[0];
	const target = join(
		repoRoot(),
		"apps",
		to,
		"src",
		"content",
		"book",
		"mechanisms",
		`${slug}.mdx`,
	);
	if (existsSync(target)) {
		console.error(
			`${relative(repoRoot(), target)} exists but is not ${slug}. Rename it first.`,
		);
		return 1;
	}
	console.log(
		`${dryRun ? "Would share" : "Shared"} ${slug} with ${to}, copied from ${source.book}:\n  + ${relative(repoRoot(), target)}`,
	);
	if (dryRun) {
		console.log("\nNothing written (--dry-run).");
		return 0;
	}
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, readFileSync(source.file, "utf8"));
	console.log(
		`\nNext: list ${slug} in the mechanisms: of ${to}'s chapters that use it, then bun run bookkit check ${to}. Edit the contract in one book and bun run bookkit sync ${slug} copies it to the others.`,
	);
	return 0;
}

/** bookkit sync <slug> [--from <book>]: one contract for every copy. */
export function sync(rest: string[]): number {
	const usage =
		"bun run bookkit sync <mechanism> [--from <book>] [--to <book>] [--dry-run]";
	const [slug] = positionals(rest, ["--from", "--to"]);
	const unknown = rest.filter(
		(arg) =>
			arg.startsWith("--") && !["--from", "--to", "--dry-run"].includes(arg),
	);
	if (!slug || unknown.length > 0) {
		console.error(
			`${unknown.length > 0 ? `Unknown option ${unknown.join(", ")}.\n` : ""}Usage: ${usage}\nCopies one copy's contract (default: the one edited last) to the mechanism's other books in its corpus; --to <book> also shares it with a book that has no copy yet.`,
		);
		return 1;
	}
	const from = flagValue(rest, "--from");
	const to = flagValue(rest, "--to");
	if (to) return shareMechanism(slug, to, from, rest.includes("--dry-run"));
	const plan = planSync(slug, from);
	if ("error" in plan) {
		console.error(plan.error);
		return 1;
	}
	if (plan.changes.length === 0) {
		console.log(
			plan.books.length === 0
				? `${slug} is in ${plan.from} only; there is nothing to sync.`
				: `${slug} already reads the same in ${[plan.from, ...plan.books].join(", ")}.`,
		);
		return 0;
	}
	const dryRun = rest.includes("--dry-run");
	console.log(
		`${dryRun ? "Would copy" : "Copied"} ${slug}'s contract from ${plan.from}${from ? "" : " (the copy edited last; --from <book> picks another)"} to:`,
	);
	printChanges(plan.changes);
	if (dryRun) {
		console.log("\nNothing written (--dry-run).");
		return 0;
	}
	applyChanges(plan.changes);
	return 0;
}
