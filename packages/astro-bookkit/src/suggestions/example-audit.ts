import type { MechanismRecord } from "./mechanism-overlap";
import { overlapRatio, tokenize } from "./tokenize";
import type { ContentSuggestion } from "./types";

export type ExampleRecord = {
	mechanism: string;
	domain: string;
	title: string;
	body: string;
	file?: string;
	/** Raw frontmatter keys present on the example file. */
	frontmatterKeys?: string[];
};

export type ExampleAuditOptions = {
	book: string;
	mechanisms: MechanismRecord[];
	/** Fraction of the mechanism's signature terms that, when present in the example body, flags restatement. */
	signatureThreshold?: number;
};

const DEFAULT_SIGNATURE_THRESHOLD = 0.35;

const CONTRACT_KEYS = [
	"is",
	"isNot",
	"predictions",
	"tests",
	"definition",
	"slug",
	"mechanism",
];
const ALLOWED_EXAMPLE_KEYS = ["mechanism", "domain", "title", "status"];

const round = (value: number): number => Math.round(value * 100) / 100;

export const auditExampleSwappability = (
	examples: ExampleRecord[],
	options: ExampleAuditOptions,
): ContentSuggestion[] => {
	const threshold = options.signatureThreshold ?? DEFAULT_SIGNATURE_THRESHOLD;
	const mechanismsBySlug = new Map(options.mechanisms.map((m) => [m.slug, m]));
	const suggestions: ContentSuggestion[] = [];

	for (const example of examples) {
		const mechanism = mechanismsBySlug.get(example.mechanism);

		if (!mechanism) {
			suggestions.push({
				category: "example-swap",
				severity: "info",
				book: options.book,
				file: example.file ?? example.title,
				message: `Example "${example.title}" references mechanism "${example.mechanism}" but no mechanism with that slug exists.`,
				nextAction:
					"Point the example at a registered mechanism slug, or register the mechanism first.",
				evidence: { mechanism: example.mechanism },
			});
			continue;
		}

		const signature = tokenize(
			[...mechanism.is, ...mechanism.isNot, mechanism.definition].join(" "),
		);
		const bodyWords = tokenize(example.body);
		const reuse = overlapRatio(signature, bodyWords);

		if (reuse >= threshold) {
			suggestions.push({
				category: "example-swap",
				severity: "advisory",
				book: options.book,
				file: example.file ?? example.title,
				message: `Example "${example.title}" reuses ${round(reuse * 100)}% of ${mechanism.title}'s signature vocabulary. It may be restating the mechanism instead of illustrating it.`,
				nextAction:
					"Replace the definition-level language with a concrete, replaceable situation in the example's domain. Current events must not define the mechanism.",
				evidence: {
					mechanism: mechanism.slug,
					signatureReuse: round(reuse),
					threshold: round(threshold),
				},
			});
		}

		const contractKeysUsed = (example.frontmatterKeys ?? []).filter(
			(key) => key !== "mechanism" && CONTRACT_KEYS.includes(key),
		);
		if (contractKeysUsed.length > 0) {
			suggestions.push({
				category: "example-swap",
				severity: "warning",
				book: options.book,
				file: example.file ?? example.title,
				message: `Example "${example.title}" carries mechanism-contract fields (${contractKeysUsed.join(", ")}) in frontmatter. Examples must not redefine a mechanism.`,
				nextAction:
					"Move is/isNot/predictions/tests onto the mechanism page and keep the example to the mechanism slug, domain, title, and status.",
				evidence: {
					contractKeys: contractKeysUsed,
					allowedKeys: ALLOWED_EXAMPLE_KEYS,
				},
			});
		}
	}

	return suggestions;
};
