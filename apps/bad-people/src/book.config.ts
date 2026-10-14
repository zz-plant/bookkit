const isProduction = process.env.NODE_ENV === "production";
const forceNoindex = process.env.BOOKKIT_NOINDEX === "true";

export const bookConfig = {
	slug: "bad-people",
	title: "Bad People",
	status: "draft",
	author: { name: "Kanav Jain" },
	site: {
		url: "https://bad-people.book",
		enforceHttps: true,
		indexable: isProduction && !forceNoindex,
		defaultMeta: {
			description:
				"How systems normalize harm, and how to respond with small, reversible actions.",
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
			{
				code: "es",
				label: "Español",
				completeness: 0.65,
			},
		],
	},
	previewAccess: {
		enabled: true,
		paramName: "preview",
		protectedPaths: ["/"],
		tokens: [
			{
				token: "bp-preview-review-7f3a1c",
				label: "Editorial review",
				expiresAt: "2026-01-31",
			},
			{
				token: "bp-preview-partner-4d9e2b",
				label: "Partner feedback",
				expiresAt: "2026-03-15",
			},
			{
				token: "bp-preview-legacy-9c2d5e",
				label: "Legacy link",
				revoked: true,
			},
		],
	},
	features: {
		aiQa: true,
	},
	objectives: {
		readerStart:
			"Feels isolated, over-responsible, and unsure how to act when harm is normalized.",
		readerEnd:
			"Can follow the load, price recourse, spot hidden buffers, and execute a small, reversible move that routes ownership correctly.",
		transformation:
			"From personalized blame to reflexive load-tracing and volatility allocation with concrete, low-risk actions.",
	},
	frame: {
		slug: "intervention",
		steps: ["recognition", "exoneration", "mechanism", "agency"],
		intent:
			"Move readers from seeing harm to locating the mechanism and taking a small, executable action.",
	},
	causalStance:
		"Harm persists through incentive alignment and transfer, not individual villainy.",
	constraints: {
		mechanismCountTarget: [6, 8],
		actionPrimitiveMaxMinutes: 10,
		examplesMustBeSwappable: true,
		orderingModel: "constraint-graph",
	},
	mechanisms: [
		{
			slug: "transfer-success",
			focus:
				"Systems that succeed by transferring cost, risk, or blame downward.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "bureaucracy-moral-technology",
			focus: "Procedures that convert compliance into moral cover.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "compliance-trap",
			focus: "Warmth leveraged to secure compliance and block refusal.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "delay-as-force",
			focus: "Waiting used to exhaust options and coerce agreement.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "reputation-membrane",
			focus:
				"Safety/ethics used as reputation shields without real reversibility.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "reversal-capacity",
			focus:
				"Access to documentation, allies, and buffers determines who can reverse harm.",
			actionPrimitiveCountTarget: 1,
		},
	],
	glossaryFocus: [
		"transfer success",
		"moral technology",
		"compliance trap",
		"delay as force",
		"reputation membrane",
		"reversal capacity",
		"repair clock",
		"recourse cost",
		"volatility allocation",
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
			title: "Don't Turn People Into Infrastructure",
			description:
				"Where institutional heat gets dumped, who absorbs it, and how to cool it down.",
			href: "https://running-hot.book",
		},
	],
} as const;

export default bookConfig;
