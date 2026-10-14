export const bookConfig = {
	slug: "crumple-zone",
	title:
		"The Crumple Zone: How Systems Externalize Harm and What to Build Instead",
	status: "draft",
	author: { name: "Kanav Jain" },
	site: {
		url: "https://crumple-zone.book",
		enforceHttps: true,
		indexable: false,
		defaultMeta: {
			description:
				"When systems fail, people absorb the impact. This book names the patterns that make that happen and what to build instead.",
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
		readerStart:
			"Feels stuck at the starting edge of the transformation and lacks a reliable next move.",
		readerEnd:
			"Can name the core mechanism, route responsibility correctly, and take a small, reversible action.",
		transformation:
			"From stuck and over-responsible to system-aware action with a concrete first step.",
	},
	frame: {
		slug: "intervention",
		steps: ["recognition", "exoneration", "mechanism", "agency"],
		intent: "Move readers from recognition to agency with enforceable steps.",
	},
	causalStance:
		"Outcomes are shaped by incentives and constraints, not just individual intent or character.",
	constraints: {
		mechanismCountTarget: [16, 22],
		actionPrimitiveMaxMinutes: 10,
		examplesMustBeSwappable: true,
		orderingModel: "constraint-graph",
	},
	mechanisms: [
		{
			slug: "crumple-zone",
			focus:
				"Individuals absorb the force of systemic failures; human bodies become the cheapest shock absorbers.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "frictionless-extraction",
			focus:
				"Seamlessness serves the extractor, not the extracted; every removed friction removes a refusal point.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "refusability-gap",
			focus:
				"The ability to say no is treated as optional when it should be a structural design requirement.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "cowardice-of-inference",
			focus:
				"Drawing the correct conclusion without the courage or machinery to act on it.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "death-of-slack",
			focus:
				"Eliminating buffer and margin breaks people instead of systems; slack is structural mercy.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "temporal-capture",
			focus:
				"Institutions capture human duration as a resource; time is extracted but never accounted for.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "pyrrhic-condition",
			focus: "Winning in a way that destroys what made winning worthwhile.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "toil-fetishism",
			focus:
				"Suffering and prolonged effort worshipped as markers of legitimacy; ease is treated as cheating.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "maintenance-deficit",
			focus:
				"Maintenance is invisible labor until failure; the gap between needs and resources is the deficit.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "institutional-apoptosis",
			focus:
				"Programmed death of institutions that can no longer maintain their function.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "governance-by-caricature",
			focus:
				"Institutions ruled by distorted, simplified, weaponized versions of their own principles.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "vibe-legitimacy",
			focus:
				"Authority derived from aesthetic and affect rather than demonstrated competence.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "credibility-access-control",
			focus:
				"Credibility is gatekeeping disguised as quality control; who gets believed determines access.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "sanctiphagy",
			focus:
				"Systems consume and commodify moral goodness; virtue is extracted, branded, and the husk discarded.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "wound-worship",
			focus:
				"Harm is valorized to silence dissent, preventing structural change.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "consent-maintenance-pressure",
			focus:
				"Forces that prevent withdrawal of consent after it has been given.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "clearance-culture",
			focus:
				"Needing institutional permission to re-enter after any deviation from expected behavior.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "surveillance-universality",
			focus:
				"When systems must serve everyone, the incentive to surveil and sort disappears.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "volatocracy",
			focus:
				"Rule through manufactured instability; keeping people too unsteady to organize.",
			actionPrimitiveCountTarget: 1,
		},
	],
	glossaryFocus: [
		"crumple zone",
		"frictionless extraction",
		"refusability gap",
		"coercion by design",
		"cowardice of inference",
		"death of slack",
		"temporal capture",
		"pyrrhic condition",
		"toil fetishism",
		"maintenance deficit",
		"institutional apoptosis",
		"governance by caricature",
		"vibe-based legitimacy",
		"credibility as access control",
		"sanctiphagy",
		"wound worship",
		"consent maintenance pressure",
		"clearance culture",
		"surveillance",
		"volatocracy",
	],
	// Linked from the home page under "Other books".
	relatedBooks: [
		{
			title: "On-Call Runbook",
			description:
				"Classify alerts, pick a safe first action, escalate with a named target, and verify recovery.",
			href: "https://on-call.book",
		},
		{
			title: "Bad People",
			description:
				"How systems normalize harm and how to respond with small, reversible actions.",
			href: "https://bad-people.book",
		},
		{
			title: "Don't Turn People Into Infrastructure",
			description:
				"Where institutional heat gets dumped, who absorbs it, and how to cool it down.",
			href: "https://running-hot.book",
		},
	],
} as const;

export default bookConfig;
