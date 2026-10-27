import type { BookConfig } from "@bookkit/astro-bookkit";

// The author's decisions for this book. Every field is described on the
// BookConfig type (packages/astro-bookkit/src/book/config.ts). The text values
// below are placeholders: they show on the book's About this book page
// (/read/overview) until you replace them.
export const bookConfig = {
	slug: "match-to-july",
	title: "Match Day to July 1",
	status: "draft",
	site: {
		// Where the book will be published; canonical URLs, the sitemap, and
		// robots.txt use it.
		url: "https://match-to-july.book",
		enforceHttps: true,
		indexable: false,
		defaultMeta: {
			description:
				"The non-clinical steps between Match Day and a new resident's first loan payment: the training license, the paycheck gap, first-year withholding, RAP, residency forbearance and PSLF, each with its primary source.",
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
		aiQa: false,
	},
	objectives: {
		readerStart:
			"A matched medical student between Match Day and July 1, with a residency agreement to sign, a state board to apply to, a move to pay for and federal loans in their grace period.",
		readerEnd:
			"Can name the dates and dollar amounts that the license, the first paychecks, the W-4 and the loan grace period set, find the primary source for each, and list the questions to put to the GME office, payroll and the loan servicer.",
		transformation:
			"From a sequence learned one surprise at a time to a dated list of rules, each with its source and its question.",
	},
	frame: {
		slug: "field-guide",
		steps: ["steps", "failure-modes", "checklist"],
		intent:
			"Move the reader through the steps from Match Day to the first loan payment, the failure modes each rule produces, and a checklist of 10-minute actions.",
	},
	causalStance:
		"The costs of the first months of residency come from rules and schedules (a tax return a year out of date, a payroll calendar, a board's processing time, an annualized withholding table, a forbearance that pauses PSLF), not from the reader's planning.",
	constraints: {
		mechanismCountTarget: [5, 6],
		actionPrimitiveMaxMinutes: 10,
		examplesMustBeSwappable: true,
		orderingModel: "constraint-graph",
	},
	// The mechanisms the book commits to, each with the one sentence it uses
	// it to explain: { slug: "...", focus: "..." }.
	mechanisms: [
		{
			slug: "license-lead-time",
			focus:
				"A state board's processing window, not the Match date, sets when a training license is ready.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "paycheck-gap",
			focus:
				"About 50 days separate the last school month from the first paycheck, and the move falls inside them.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "annualized-withholding",
			focus:
				"Payroll withholds half a year of pay at a full-year rate, so the first return tends to produce a refund.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "student-year-pricing",
			focus:
				"The first year of RAP payments is priced on a student-year tax return, so it sits at or near the $10 minimum.",
			actionPrimitiveCountTarget: 1,
		},
		{
			slug: "uncounted-forbearance",
			focus:
				"Residency forbearance lets interest accrue and its months never count toward PSLF.",
			actionPrimitiveCountTarget: 1,
		},
	],
	glossaryFocus: [
		"training license",
		"grace period",
		"RAP",
		"residency forbearance",
		"PSLF",
		"part-year withholding method",
	],
	// Copy on the home page: a short label above the title (such as "Field
	// guide"; empty for none) and the "Where to start" card that opens the
	// mechanisms index.
	home: {
		kicker: "Field guide",
		mechanismsCard: {
			title: "Find the rule",
			description:
				"The five rules that set the costs between Match Day and the first loan payment.",
		},
	},
	// Copy on the reading hub (/read): the line under its title, and the
	// "Where to start" cards. Leave quickStartCards out for the default ones
	// (About this book, the chapter list, and "Start with chapter 1: <its
	// title>"), or list your own in order ({ title, description, href,
	// recommended?, funnelStep? }); an empty list shows none.
	readHub: {
		lede: "See what the book sets out to do, start at chapter 1, or look something up.",
	},
	// The mechanisms index (/read/mechanisms): the line under its title, and
	// how urgent each mechanism is by slug ("urgent", "high-leverage" or
	// "stabilize"), which orders the list and adds tag filters.
	mechanismsIndex: {
		lede: "The five rules behind the costs of the first months of residency, with the source for each.",
		urgency: {
			"license-lead-time": "urgent",
			"paycheck-gap": "urgent",
			"annualized-withholding": "stabilize",
			"student-year-pricing": "high-leverage",
			"uncounted-forbearance": "high-leverage",
		},
	},
	// Other books to link from the home page: { title, href, description }.
	relatedBooks: [],
} as const satisfies BookConfig;

export default bookConfig;
