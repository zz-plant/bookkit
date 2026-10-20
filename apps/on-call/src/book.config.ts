const isProduction = process.env.NODE_ENV === "production";
const forceNoindex = process.env.BOOKKIT_NOINDEX === "true";

export const bookConfig = {
	slug: "on-call",
	title: "On-Call Runbook",
	status: "published",
	site: {
		url: "https://on-call.book",
		enforceHttps: true,
		indexable: isProduction && !forceNoindex,
		defaultMeta: {
			description:
				"A runbook for on-call engineers: classify the alert, pick a safe first action, escalate to the right owner, and verify recovery.",
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
			"A lone on-call engineer with a pager alert and no clear first move.",
		readerEnd:
			"Can classify an alert, pick a safe first action, escalate to the right owner, and verify recovery within the stated windows.",
		transformation:
			"From reactive alarm to bounded, verifiable procedure with an explicit owner and escape hatch.",
	},
	// The procedures here are an example; their review dates are fixtures, judged
	// as of the book's last release so check:runbooks does not age them.
	reviewsAsOf: "2026-02-10",
	frame: {
		slug: "runbook",
		steps: ["ownership", "trigger", "steps", "escalation", "verification"],
		intent:
			"Move owners from an ambiguous alert to a documented, drilled, verifiable procedure.",
	},
	causalStance:
		"Incident chaos persists through missing ownership and undrilled procedures, not through individual laziness.",
	constraints: {
		mechanismCountTarget: [4, 6],
		actionPrimitiveMaxMinutes: 10,
		examplesMustBeSwappable: true,
		orderingModel: "constraint-graph",
	},
	mechanisms: [
		{
			slug: "incident-triage",
			focus:
				"Alert chaos collapses when severity is classified under a time budget.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "rollback-first-change",
			focus:
				"Every deploy is reversible only when a rollback candidate exists before go-live.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "minimal-repro-doc",
			focus:
				"A diagnosis that cannot be reproduced on paper will stall in a handoff.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "bounded-escalation",
			focus:
				"An escalation is only useful when a target, trigger, and window are stated.",
			actionPrimitiveCountTarget: 1,
		},
	],
	glossaryFocus: [
		"severity",
		"sev-1",
		"rollback candidate",
		"reproduction",
		"escalation ramp",
		"pager queue",
	],
	// Copy on the home page.
	home: {
		kicker: "Runbook",
		mechanismsCard: {
			title: "Find the pattern",
			description:
				"Mid-incident? Match what you’re seeing to a pattern and its first safe action.",
		},
	},
	readHub: {
		lede: "Start with the overview, go straight to a problem you have, or look something up.",
		quickStartCards: [
			{
				title: "Read the overview",
				description: "What the book covers and how it’s organized.",
				href: "/read/overview",
				recommended: true,
				funnelStep: "new_reader_overview",
			},
			{
				title: "Learn incident triage",
				description: "Why an alert without a severity has no safe next action.",
				href: "/read/mechanisms/incident-triage",
				funnelStep: "new_reader_mechanism",
			},
			{
				title: "Classify an alert",
				description:
					"The ten-minute procedure for the first minutes of a page.",
				href: "/read/toolkit/classify-alert-severity",
				funnelStep: "new_reader_toolkit",
			},
		],
	},
	mechanismsIndex: {
		lede: "Recurring incident patterns, how to recognize each one, and what to do first.",
	},
	// Linked from the home page under "Other books".
	relatedBooks: [
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
