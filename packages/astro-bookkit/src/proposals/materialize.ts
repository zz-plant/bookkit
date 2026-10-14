import { scaffoldSource } from "../validators/content-check";
import type { MechanismProposal, ToolProposal } from "./types";

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/**
 * The mechanism file for an accepted proposal, built from the content
 * contract. Only the name comes from the text; definition, boundaries,
 * predictions, and tests are left empty with what each needs (as `bookkit new
 * mechanism` does), and the evidence that prompted the draft goes in a comment.
 */
export const mechanismFrontmatter = (proposal: MechanismProposal): string => {
	const { evidence } = proposal;
	const where = evidence.files.map(fileName).join(", ");
	// Braces would end the MDX comment's expression early.
	const example = evidence.example
		? ` For example, ${fileName(evidence.example.file)}: "${evidence.example.sentence.replace(/[{}]/g, "")}"`
		: "";
	return scaffoldSource(
		"mechanism",
		{ slug: proposal.slug, title: proposal.title, status: "draft" },
		`Draft from proposal ${proposal.id}: "${evidence.term}" is used ${evidence.occurrences} times in ${where}.${example} Write the definition and boundaries from what the book means by it; bun run bookkit check <this file> says what each field needs.`,
	);
};

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
		`Draft from proposal ${proposal.id}. Name the tool after the move it makes (name, slug, and file name), then fill trigger, steps, failureLooksLike, and legitimateDemand; bun run bookkit check <this file> says what each needs.`,
	);
