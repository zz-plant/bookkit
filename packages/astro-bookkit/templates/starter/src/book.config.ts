import type { BookConfig } from "@bookkit/astro-bookkit";

// The author's decisions for this book. Every field is described on the
// BookConfig type (packages/astro-bookkit/src/book/config.ts). The text values
// below are placeholders: they show on the book's overview page until you
// replace them.
export const bookConfig = {
	slug: "__BOOK_SLUG__",
	title: "__BOOK_TITLE__",
	status: "draft",
	site: {
		// Where the book will be published; canonical URLs, the sitemap, and
		// robots.txt use it.
		url: "https://__BOOK_SLUG__.book",
		enforceHttps: true,
		indexable: false,
		defaultMeta: {
			description: "Draft of __BOOK_TITLE__.",
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
			"Who the reader is before the first page, and what they cannot do yet.",
		readerEnd: "What the reader can do after the last page.",
		transformation: "The change between the two, in one sentence.",
	},
	frame: {
		slug: "intervention",
		steps: ["recognition", "exoneration", "mechanism", "agency"],
		intent: "What the book moves the reader through, one frame step at a time.",
	},
	causalStance:
		"The book's core claim about what causes the problem it covers.",
	constraints: {
		mechanismCountTarget: [6, 8],
		actionPrimitiveMaxMinutes: 10,
		examplesMustBeSwappable: true,
		orderingModel: "constraint-graph",
	},
	// The mechanisms the book commits to, each with the one sentence it uses
	// it to explain: { slug: "...", focus: "..." }.
	mechanisms: [],
	glossaryFocus: [],
	// Copy on the home page: a short label above the title (such as "Field
	// guide"; empty for none) and the "Where to start" card that opens the
	// mechanisms index.
	home: {
		kicker: "",
		mechanismsCard: {
			title: "Browse the mechanisms",
			description: "The named patterns this book explains.",
		},
	},
	// Other books to link from the home page: { title, href, description }.
	relatedBooks: [],
} as const satisfies BookConfig;

export default bookConfig;
