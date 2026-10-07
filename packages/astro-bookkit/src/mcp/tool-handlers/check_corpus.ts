import { runWorkspaceCommand } from "../command-runner";
import type { ToolHandler } from "./types";

const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};

export const handleCheckCorpus: ToolHandler = ({ options, args }) => {
	const semantic = args?.semantic === true;
	const command = runWorkspaceCommand(options.workspaceRoot, [
		"run",
		"scripts/check-corpus.ts",
		"--json",
		...(semantic ? [] : ["--no-semantic"]),
	]);
	const report = parseJson(command.stdout) as {
		clusters?: unknown[];
		staleDecisions?: unknown[];
		shared?: Array<{ driftedFields?: unknown[] }>;
	} | null;
	const unresolved = report
		? (report.clusters?.length ?? 0) +
			(report.staleDecisions?.length ?? 0) +
			(report.shared ?? []).filter(
				(record) => (record.driftedFields?.length ?? 0) > 0,
			).length
		: null;

	return {
		ok: command.ok && unresolved === 0,
		summary: !command.ok
			? "check:corpus failed to run."
			: unresolved === 0
				? "No unresolved overlap, drift, or stale rulings across books."
				: `${unresolved} unresolved item(s): decide each cluster (one mechanism, or a ruling in corpus.json), fix drift, or remove stale rulings.`,
		payload: {
			command: command.command,
			exitCode: command.exitCode,
			report,
			stderr: command.stderr.trim() || undefined,
		},
	};
};
