import type { MechanismProposal, ToolProposal } from "./types";

const escapeQuoted = (value: string): string => value.replace(/"/g, '\\"');

const yamlList = (items: string[]): string =>
	items.length === 0
		? '  - ""'
		: items.map((item) => `  - "${escapeQuoted(item)}"`).join("\n");

/**
 * Builds the frontmatter for a mechanism record from an accepted proposal.
 * Matches the shape the mechanism validator expects; predictions and tests are
 * intentionally left as author-filled placeholders (identical to `new:mechanism`).
 */
export const mechanismFrontmatter = (proposal: MechanismProposal): string =>
	[
		"---",
		`slug: ${proposal.slug}`,
		`title: "${escapeQuoted(proposal.title)}"`,
		`definition: "${escapeQuoted(proposal.definition)}"`,
		"is:",
		yamlList(proposal.is),
		"isNot:",
		yamlList(proposal.isNot),
		"predictions:",
		'  - ""',
		"tests:",
		'  - ""',
		"---",
		"",
		`<!-- Accepted from proposal ${proposal.id}; fill predictions + tests, then run: bun run validate -->`,
		"",
	].join("\n");

/**
 * Builds the frontmatter for a toolkit primitive bound to an accepted
 * mechanism. Mirrors `new:tool`; the author fills the executable details.
 */
export const toolFrontmatter = (proposal: ToolProposal): string =>
	[
		"---",
		`slug: ${proposal.slug}`,
		`mechanism: ${proposal.mechanism}`,
		`name: "${escapeQuoted(proposal.name)}"`,
		'trigger: ""',
		"timeboxMinutes: 10",
		"steps:",
		'  - ""',
		"failureLooksLike:",
		'  - ""',
		"legitimateDemand:",
		'  - ""',
		"---",
		"",
		`<!-- Accepted from proposal ${proposal.id}; fill trigger/steps/failure/legitimateDemand, then run: bun run validate -->`,
		"",
	].join("\n");
