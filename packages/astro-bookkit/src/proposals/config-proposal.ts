import { defaultFrames } from "../frames/defaults";
import type { ConfigDraft, FrameDetection } from "./types";

export type ConfigProposalOptions = {
	book: string;
	title?: string;
	frame: FrameDetection;
	causalStance?: string;
};

const fallbackFrame: FrameDetection = {
	frameSlug: "intervention",
	confidence: 0,
	runbookHits: 0,
	teachingHits: 0,
	source: "detected",
};

const escapeQuoted = (value: string): string => value.replace(/"/g, '\\"');

export const proposeConfigDraft = (
	options: ConfigProposalOptions,
): ConfigDraft => {
	const frame = options.frame ?? fallbackFrame;
	const frameDefinition = defaultFrames.find((f) => f.slug === frame.frameSlug);
	const steps = frameDefinition?.steps.map((s) => s.id) ?? [];
	const isRunbook = frame.frameSlug === "runbook";
	const title = options.title ?? options.book;

	const readerStart = isRunbook
		? "A lone operator facing a trigger with no documented first move."
		: "Feels stuck at the starting edge of the transformation and lacks a reliable next move.";
	const readerEnd = isRunbook
		? "Can own the procedure, execute its steps, escalate at the right boundary, and verify recovery."
		: "Can name the core mechanism, route responsibility correctly, and take a small, reversible action.";
	const transformation = isRunbook
		? "From ambiguous trigger to an owned, drilled, verifiable procedure with an explicit escape hatch."
		: "From stuck and over-responsible to system-aware action with a concrete first step.";
	const intent = isRunbook
		? "Move owners from an ambiguous trigger to a documented, drilled, verifiable procedure."
		: "Move readers from recognition to agency with enforceable steps.";
	const causalStance =
		options.causalStance ??
		(isRunbook
			? "Operational chaos persists through missing ownership and undrilled procedures, not through individual laziness."
			: "Outcomes are shaped by incentives and constraints, not just individual intent or character.");

	const source = `export const bookConfig = {
	slug: "${options.book}",
	title: "${escapeQuoted(title)}",
	status: "draft",
	site: {
		url: "https://${options.book}.book",
		enforceHttps: true,
		indexable: false,
		defaultMeta: {
			description: "Draft book instance for ${escapeQuoted(title)}.",
			ogImage: "/og/default.svg",
		},
	},
	localization: {
		defaultLocale: "en",
		includeDefaultPrefix: false,
		label: "Language",
		locales: [
			{
				code: "en",
				label: "English",
				isDefault: true,
				completeness: 1,
			},
		],
	},
	previewAccess: {
		enabled: false,
		paramName: "preview",
		protectedPaths: ["/"],
		tokens: [],
	},
	features: {
		aiQa: true,
	},
	objectives: {
		readerStart: "${escapeQuoted(readerStart)}",
		readerEnd: "${escapeQuoted(readerEnd)}",
		transformation: "${escapeQuoted(transformation)}",
	},
	frame: {
		slug: "${frame.frameSlug}",
		steps: [${steps.map((s) => `"${s}"`).join(", ")}],
		intent: "${escapeQuoted(intent)}",
	},
	causalStance: "${escapeQuoted(causalStance)}",
	constraints: {
		mechanismCountTarget: [6, 8],
		actionPrimitiveMaxMinutes: 10,
		examplesMustBeSwappable: true,
		orderingModel: "constraint-graph",
	},
	mechanisms: [],
	glossaryFocus: [],
} as const;

export default bookConfig;
`;

	return {
		id: "config:detected",
		frame,
		readerStart,
		readerEnd,
		transformation,
		intent,
		source,
	};
};
