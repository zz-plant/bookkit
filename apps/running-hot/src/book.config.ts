export const bookConfig = {
	slug: "running-hot",
	title:
		"Don’t Turn People Into Infrastructure: Why Institutions Run Hot — and Who They Burn",
	status: "draft",
	author: { name: "Kanav Jain" },
	site: {
		url: "https://running-hot.book",
		enforceHttps: true,
		indexable: false,
		defaultMeta: {
			description:
				"Institutions often buy their stability by pushing volatility onto people. Where that heat lands, who absorbs it, and how to cool it down.",
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
			"Feels overheated by obligation and blamed for adapting to systems that offload harm.",
		readerEnd:
			"Can name where institutional heat is being dumped, route ownership clearly, and run a reversible cooling move.",
		transformation:
			"From overload sympathy to enforceable accountability for where heat goes, who pays, and how repair happens.",
	},
	frame: {
		slug: "intervention",
		steps: ["recognition", "exoneration", "mechanism", "agency"],
		intent:
			"Move readers from symptom heat to structural diagnosis and executable cooling actions.",
	},
	causalStance:
		"Systems continue operating by moving volatility somewhere; when cooling is underfunded, humans absorb the load.",
	constraints: {
		mechanismCountTarget: [6, 8],
		actionPrimitiveMaxMinutes: 10,
		examplesMustBeSwappable: true,
		orderingModel: "constraint-graph",
	},
	mechanisms: [
		{
			slug: "crumple-zone",
			focus:
				"Institutions preserve throughput by externalizing thermal load into waiting, paperwork, and emotional labor.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "obligation-without-custody",
			focus:
				"People are assigned responsibility for outcomes without control over levers required to produce those outcomes.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "delay-as-force",
			focus:
				"Elapsed time is used as an enforcement tool that transfers costs to people while preserving institutional optionality.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "documentation-tollbooth",
			focus:
				"Proof requirements are repeatedly re-imposed so access depends on administrative stamina instead of entitlement.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "discretion-as-gate",
			focus:
				"Opaque judgment windows determine access without predictable standards, creating extraction risk and arbitrariness.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "reversibility-gap",
			focus:
				"Institutions can impose harmful states instantly, but people cannot restore baseline quickly when decisions are wrong.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "attrition-by-queue",
			focus:
				"Queue design quietly filters people out through repeated waits, resets, and drop-off points that look neutral on paper.",
			actionPrimitiveCountTarget: 1,
		},
	],
	glossaryFocus: [
		"running hot",
		"crumple zone",
		"obligation without custody",
		"delay as force",
		"documentation tollbooth",
		"discretion as gate",
		"reversibility gap",
		"attrition by queue",
		"engineered dissipation",
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
	],
} as const;

export default bookConfig;
