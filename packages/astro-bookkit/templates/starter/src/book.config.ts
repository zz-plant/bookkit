import type { BookConfig } from "@bookkit/astro-bookkit";

// The author's decisions for this book. Every field is described on the
// BookConfig type (packages/astro-bookkit/src/book/config.ts). The text values
// below are placeholders: they show on the book's About this book page
// (/read/overview) until you replace them.
export const bookConfig = {
	slug: "__BOOK_SLUG__",
	title: "__BOOK_TITLE__",
	status: "draft",
	site: {
		// Where the book will be published; canonical URLs, the sitemap, and
		// robots.txt use it. A draft is kept out of search until its status is
		// published or stable.
		url: "https://__BOOK_SLUG__.book",
		enforceHttps: true,
		defaultMeta: {
			description: "Draft of __BOOK_TITLE__.",
		},
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
	// Optional fields, each with an engine default until you set it:
	// - author: { name, url? }, the byline.
	// - home: { kicker, mechanismsCard: { title, description } }, the home
	//   page's label above the title and its card for the mechanisms index.
	// - readHub: { lede, quickStartCards }, the reading hub's line under its
	//   title and its "Where to start" cards ([] shows none).
	// - mechanismsIndex: { lede, urgency }, the mechanisms index's line under
	//   its title, and "urgent", "high-leverage" or "stabilize" by slug.
	// - relatedBooks: [{ title, href, description? }], other books to link.
	// - localization: other languages; the default is English only.
	// - previewAccess: token-gated previews, which need a server runtime.
} as const satisfies BookConfig;

export default bookConfig;
