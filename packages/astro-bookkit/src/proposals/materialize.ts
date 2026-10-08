import { scaffoldSource } from "../validators/content-check";
import type { MechanismProposal, ToolProposal } from "./types";

/**
 * The mechanism file for an accepted proposal, built from the content
 * contract: the proposal's definition and boundaries, with predictions and
 * tests left as placeholders for the author (as `bookkit new mechanism` does).
 */
export const mechanismFrontmatter = (proposal: MechanismProposal): string =>
	scaffoldSource(
		"mechanism",
		{
			slug: proposal.slug,
			title: proposal.title,
			definition: proposal.definition,
			is: proposal.is,
			isNot: proposal.isNot,
			status: "draft",
		},
		`Accepted from proposal ${proposal.id}. Fill predictions and tests; bun run bookkit check <this file> says what each needs.`,
	);

/**
 * The tool file for a mechanism, built from the content contract. Mirrors
 * `bookkit new tool`; the author fills the executable details.
 */
export const toolFrontmatter = (proposal: ToolProposal): string =>
	scaffoldSource(
		"tool",
		{
			slug: proposal.slug,
			mechanism: proposal.mechanism,
			name: proposal.name,
			timeboxMinutes: 10,
			status: "draft",
		},
		`Accepted from proposal ${proposal.id}. Fill trigger, steps, failureLooksLike, and legitimateDemand; bun run bookkit check <this file> says what each needs.`,
	);
