import { runWorkspaceCommand } from "../command-runner";
import type { ToolHandler } from "./types";

export const handleFindSimilarMechanisms: ToolHandler = async ({
	options,
	args,
}) => {
	const title = typeof args?.title === "string" ? args.title.trim() : "";
	if (!title) {
		return {
			ok: false,
			summary: "Missing title.",
			payload: {},
			error: {
				cause: "A proposed mechanism title is required.",
				nextAction: 'Call again with { title: "<proposed title>" }.',
			},
		};
	}
	const definition =
		typeof args?.definition === "string" ? args.definition : undefined;
	const command = await runWorkspaceCommand(options.workspaceRoot, [
		"run",
		"scripts/bookkit.ts",
		"similar",
		title,
		...(definition ? ["--definition", definition] : []),
		...(args?.semantic === true ? ["--semantic"] : []),
		"--json",
	]);
	let result: {
		existingSlug?: string[];
		method?: string;
		note?: string;
		similar?: Array<{ slug: string; books: string[] }>;
	} | null = null;
	try {
		result = JSON.parse(command.stdout);
	} catch {
		result = null;
	}
	const existing = result?.existingSlug ?? [];
	const similar = result?.similar ?? [];
	const wordingOnly =
		args?.semantic === true && result && result.method !== "meaning"
			? ` Ranked by wording only: ${result.note ?? "the embedding model did not load."} Set BOOKKIT_DOWNLOAD_MODEL=1 in the MCP server's environment to allow the ~520 MB model download.`
			: "";

	return {
		ok: command.ok && result !== null,
		summary: !result
			? "Could not run the similarity check."
			: `${
					existing.length > 0
						? `Its slug already exists in ${existing.join(", ")}; share that mechanism instead of creating one.`
						: similar.length > 0
							? `Closest by ${result.method ?? "wording"}: ${similar.map((match) => match.slug).join(", ")}. Bind one if it is the same idea.`
							: "No existing mechanism shares its wording."
				}${wordingOnly}`,
		payload: {
			result,
			command: command.command,
			exitCode: command.exitCode,
		},
	};
};
