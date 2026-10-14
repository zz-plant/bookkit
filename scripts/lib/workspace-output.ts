/**
 * `bun run --workspaces <script>` runs every package at once and prefixes each
 * line with the package and script (`@books/on-call build: …`), ending each
 * package with `Exited with code N`. When one book fails, the last lines of
 * the combined output usually belong to the books that passed, so a tail of
 * it hides which book broke and why.
 */

export type FailedWorkspace = {
	/** The package name without its scope: `on-call` for `@books/on-call`. */
	name: string;
	/** That package's own lines, prefix removed, in order. */
	lines: string[];
};

const PREFIXED = /^(@?[\w.-]+(?:\/[\w.-]+)?) [\w:.-]+: ?(.*)$/;
const FAILED_EXIT = /^Exited with (?:code [1-9]\d*|signal \w+)$/;

/** The packages that exited nonzero, each with its own output. */
export const failedWorkspaces = (output: string): FailedWorkspace[] => {
	const lines = new Map<string, string[]>();
	const failed: string[] = [];
	for (const line of output.split("\n")) {
		const match = line.match(PREFIXED);
		if (!match) continue;
		const [, name, text] = match;
		const own = lines.get(name) ?? [];
		own.push(text);
		lines.set(name, own);
		if (FAILED_EXIT.test(text.trim()) && !failed.includes(name)) {
			failed.push(name);
		}
	}
	return failed.map((name) => ({
		name: name.replace(/^@[^/]+\//, ""),
		lines: lines.get(name) ?? [],
	}));
};
