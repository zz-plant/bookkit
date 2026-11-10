import { writeFileSync } from "node:fs";
import { slugify } from "../../_lib";
import { planChapterRename } from "../chapter-moves";
import { didYouMean, flagValue, positionals } from "../cli";
import { planMerge } from "../merge-mechanisms";
import {
	planMoveTool,
	planRemoveChapter,
	planRemoveMechanism,
	planRemoveTool,
	type StructurePlan,
} from "../structure-edits";
import {
	applyChanges,
	books,
	focusBook,
	printChanges,
	requireBook,
	takeBook,
} from "./context";

/**
 * `bookkit remove`, `move`, and `rename`: a record removed, rebound, or
 * renamed, with the references to it.
 */

/** Prints a structure plan; writes it unless --dry-run. */
function carryOut(
	plan: StructurePlan,
	[would, did]: [string, string],
	rest: string[],
): number {
	if ("error" in plan) {
		console.error(plan.error);
		return 1;
	}
	const dryRun = rest.includes("--dry-run");
	console.log(`${dryRun ? would : did}:`);
	printChanges(plan.changes);
	for (const note of plan.notes) console.log(`  ${note}`);
	if (plan.leftovers.length > 0) {
		console.log("\nStill naming it (read these over):");
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
	return 0;
}

/**
 * `remove chapter|mechanism|tool [book] <slug> [--dry-run]`: the record and
 * the references that would break with it gone. A mechanism with tools or
 * examples needs --with-records to take them too.
 */
export function removeRecord(rest: string[]): number {
	const kinds = ["chapter", "mechanism", "tool"];
	const usage =
		"bun run bookkit remove chapter|mechanism|tool [book] <slug> [--dry-run] [--with-records]\n       bun run bookkit remove book <slug>";
	const [kind, ...own] = positionals(rest, []);
	const unknown = rest.filter(
		(arg) =>
			arg.startsWith("--") && !["--dry-run", "--with-records"].includes(arg),
	);
	if (!kind || !kinds.includes(kind) || unknown.length > 0) {
		console.error(
			`${unknown.length > 0 ? `Unknown option ${unknown.join(", ")}.\n` : kind && !kinds.includes(kind) ? `Cannot remove a "${kind}".${didYouMean(kind, [...kinds, "book"])}\n` : ""}Usage: ${usage}`,
		);
		return 1;
	}
	const [book, [slug]] = takeBook(own, 1, usage);
	if (!slug) {
		console.error(`Usage: ${usage}`);
		return 1;
	}
	const plan =
		kind === "chapter"
			? planRemoveChapter(book, slug)
			: kind === "tool"
				? planRemoveTool(book, slug)
				: planRemoveMechanism(book, slug, rest.includes("--with-records"));
	const status = carryOut(
		plan,
		[
			`Would remove ${kind} ${slug} from ${book}`,
			`Removed ${kind} ${slug} from ${book}`,
		],
		rest,
	);
	if (status === 0 && !rest.includes("--dry-run")) {
		console.log(
			`\nIts page, /read/${kind === "tool" ? "toolkit" : `${kind}s`}/${slug}, is gone; for a published book, say so in its release notes.\nNext: bun run bookkit check ${book}`,
		);
	}
	return status;
}

/** `move tool [book] <tool> --to <mechanism> [--dry-run]`: a tool bound to another mechanism. */
export function moveTool(rest: string[]): number {
	const usage =
		"bun run bookkit move tool [book] <tool> --to <mechanism> [--dry-run]";
	const [kind, ...own] = positionals(rest, ["--to"]);
	const to = flagValue(rest, "--to");
	if (kind !== "tool" || !to) {
		console.error(`Usage: ${usage}`);
		return 1;
	}
	const [book, [slug]] = takeBook(own, 1, usage);
	if (!slug) {
		console.error(`Usage: ${usage}`);
		return 1;
	}
	const status = carryOut(
		planMoveTool(book, slug, to),
		[
			`Would bind tool ${slug} to ${to} in ${book}`,
			`Bound tool ${slug} to ${to} in ${book}`,
		],
		rest,
	);
	if (status === 0 && !rest.includes("--dry-run")) {
		console.log(`\nNext: bun run bookkit check ${book}`);
	}
	return status;
}

/**
 * `rename mechanism [book] <slug> <new-slug> [--title "…"] [--dry-run]`: a
 * mechanism's slug changed in every book of its corpus, with every reference
 * to it (chapters, tools, examples and their folder, glossary, links,
 * config), and corpus.json recording the old slug, so a stale reference
 * names the new one. Slugs are durable identifiers: a published book's
 * readers lose /read/mechanisms/<slug>.
 */
function renameMechanism(rest: string[]): number {
	const usage =
		'bun run bookkit rename mechanism [book] <slug> <new-slug> [--title "<title>"] [--dry-run]';
	const own = positionals(rest, ["--title"]);
	const [book, slugs] =
		own.length > 2
			? [requireBook(own[0], usage), own.slice(1)]
			: [undefined, own];
	const [from, toRaw] = slugs;
	if (!from || !toRaw) {
		console.error(`Usage: ${usage}`);
		return 1;
	}
	const to = slugify(toRaw);
	const title = flagValue(rest, "--title");
	const plan = planMerge({
		keep: to,
		drop: from,
		reason: `Renamed ${from} to ${to}.`,
		date: new Date().toISOString().slice(0, 10),
		rename: { title, book },
	});
	if ("error" in plan) {
		console.error(plan.error);
		return 1;
	}
	const dryRun = rest.includes("--dry-run");
	console.log(
		`${dryRun ? "Would rename" : "Renamed"} mechanism ${from} to ${to}${title ? ` ("${title}")` : ""} in ${plan.books.join(", ")}:`,
	);
	printChanges(plan.changes);
	console.log(
		`  ~ corpus.json: ${from} recorded as renamed to ${to}${plan.carried.length > 0 ? `; ${plan.carried.length} ruling(s) moved to ${to}` : ""}`,
	);
	for (const note of plan.notes) console.log(`  ${note}`);
	if (plan.leftovers.length > 0) {
		console.log(`\nStill naming ${from} (read these over):`);
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
		`\nLinks to /read/mechanisms/${from} from outside the books no longer resolve; for a published book, say so in its release notes.\nNext: bun run bookkit check, then commit the books and corpus.json together.`,
	);
	return 0;
}

/**
 * bookkit rename chapter [book] <slug> <new-slug> [--title "…"] [--dry-run]:
 * the chapter's slug, its file name, other chapters' prerequisites, and links
 * to it, changed together (lib/chapter-moves.ts).
 */
export function renameChapter(rest: string[]): number {
	const usage =
		'bun run bookkit rename chapter [book] <slug> <new-slug> [--title "<title>"] [--dry-run]';
	if (rest[0] === "mechanism") return renameMechanism(rest.slice(1));
	if (rest[0] !== "chapter") {
		console.error(
			`Usage: ${usage}\n       bun run bookkit rename mechanism [book] <slug> <new-slug> [--title "<title>"] [--dry-run]`,
		);
		return 1;
	}
	const own = positionals(rest.slice(1), ["--title"]);
	const [book, slugs] =
		own[0] && books.includes(own[0]) && own.length > 2
			? [own[0], own.slice(1)]
			: [
					focusBook ??
						(books.length === 1 ? books[0] : requireBook(undefined, usage)),
					own,
				];
	const [from, to] = slugs;
	if (!from || !to) {
		console.error(`Usage: ${usage}`);
		return 1;
	}
	const plan = planChapterRename(book, from, to, flagValue(rest, "--title"));
	if ("error" in plan) {
		console.error(plan.error);
		return 1;
	}
	const dryRun = rest.includes("--dry-run");
	console.log(
		`${dryRun ? "Would rename" : "Renamed"} chapter ${from} to ${plan.to} in ${book}:`,
	);
	printChanges(plan.changes);
	if (plan.leftovers.length > 0) {
		console.log(`\nStill naming ${from} (read these over):`);
		for (const left of plan.leftovers.slice(0, 12)) {
			console.log(`  ${left.path}:${left.line}  ${left.text}`);
		}
	}
	if (dryRun) {
		console.log("\nNothing written (--dry-run).");
		return 0;
	}
	applyChanges(plan.changes);
	console.log(
		`\nLinks to /read/chapters/${from} from outside the book no longer resolve; for a published book, say so in its release notes.\nNext: bun run bookkit check ${book}`,
	);
	return 0;
}
