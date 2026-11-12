import { runWorkspaceCommand } from "../command-runner";
import { bookArg } from "./book-arg";
import type { ToolHandler } from "./types";

const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};

/**
 * `bookkit status --json`, and `bookkit map <book> --json` for the served
 * book or the one named: what
 * an agent needs to pick its next piece of work (the stubs, the chapters that
 * bind no mechanism, the mechanisms no chapter binds) without a shell.
 */
export const handleStatus: ToolHandler = async ({ options, args }) => {
	const picked = bookArg(options, args);
	if (!picked.ok) return picked.response;
	const status = await runWorkspaceCommand(options.workspaceRoot, [
		"scripts/bookkit.ts",
		"status",
		"--json",
	]);
	const map = picked.book
		? await runWorkspaceCommand(options.workspaceRoot, [
				"scripts/bookkit.ts",
				"map",
				picked.book,
				"--json",
			])
		: undefined;
	const books = (
		parseJson(status.stdout) as {
			books?: Array<{ book: string; stubChapters?: string[] }>;
		} | null
	)?.books;
	const ok = status.ok && Boolean(books) && (map ? map.ok : true);
	const stubs = (books ?? [])
		.filter((book) => !picked.book || book.book === picked.book)
		.reduce((sum, book) => sum + (book.stubChapters?.length ?? 0), 0);
	return {
		ok,
		summary: ok
			? `${picked.book ?? `${books?.length} book(s)`}: ${stubs} stub chapter(s).${map ? " The map lists which chapters bind which mechanisms." : " Pass book for its chapter-by-mechanism map."}`
			: "bookkit status failed to run.",
		payload: {
			books,
			map: map ? parseJson(map.stdout) : undefined,
			stderr:
				[status.stderr, map?.stderr].filter(Boolean).join("\n").trim() ||
				undefined,
		},
		error: ok
			? undefined
			: {
					cause: `bookkit status or map returned exit code ${map && !map.ok ? map.exitCode : status.exitCode}.`,
					nextAction: "Check stderr, fix the workspace, and call again.",
				},
	};
};

/** `bookkit bets --json`: the bet the work should serve, and how it measures. */
export const handleBets: ToolHandler = async ({ options }) => {
	const bets = await runWorkspaceCommand(options.workspaceRoot, [
		"scripts/bookkit.ts",
		"bets",
		"--json",
	]);
	const report = parseJson(bets.stdout) as {
		b1?: { bet?: string; title?: string; daysPastKillBy?: number };
	} | null;
	const bet = report?.b1;
	const ok = bets.ok && Boolean(report);
	return {
		ok,
		summary: !ok
			? "bookkit bets failed to run."
			: bet
				? `${bet.bet} · ${bet.title}${bet.daysPastKillBy && bet.daysPastKillBy > 0 ? ` · past its kill date by ${bet.daysPastKillBy} day(s): until the author rules on it, work is maintenance` : ""}.`
				: "No active bet: work is maintenance.",
		payload: { report, stderr: bets.stderr.trim() || undefined },
		error: ok
			? undefined
			: {
					cause: `bookkit bets returned exit code ${bets.exitCode}.`,
					nextAction: "Read docs/bets.md directly.",
				},
	};
};
