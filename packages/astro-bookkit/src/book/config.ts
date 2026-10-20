import type { PreviewAccessConfig } from "../preview/access";
import type { BookSeoConfig } from "../seo/config";
import type { BookLayoutConfig } from "./layout";
import type { BookRuntimeConfig } from "./runtime";

/** A mechanism the book commits to covering, as `book.config.ts` lists it. */
export type BookConfigMechanism = {
	/** The mechanism file's slug in `src/content/book/mechanisms/`. */
	slug: string;
	/** What the book uses it to explain, in one sentence. */
	focus: string;
	/** How many toolkit actions this mechanism should end up with. */
	actionPrimitiveCountTarget?: number;
};

/** Another book linked from this book's home page. */
export type RelatedBook = {
	title: string;
	href: string;
	description?: string;
};

/**
 * The home page's copy. Leave out any field, or `home` altogether, for the
 * default in `defaultBookHomeCopy`.
 */
export type BookHomeConfig = {
	/** A short label above the title, such as "Field guide". Empty for none. */
	kicker?: string;
	/** The "Where to start" card that opens the mechanisms index. */
	mechanismsCard?: {
		title?: string;
		description?: string;
	};
};

/**
 * Everything a book decides in `src/book.config.ts`. Each part is the type the
 * engine reads it as (layout, runtime, preview access, SEO), so a config that
 * satisfies this type type-checks wherever the app passes it to the engine.
 *
 *   export const bookConfig = { ... } as const satisfies BookConfig;
 */
export type BookConfig = BookLayoutConfig &
	// The runtime reads only each mechanism's slug; the full entry is below.
	// Intersecting both array types would type every element as `{ slug }`.
	Omit<BookRuntimeConfig, "mechanisms"> & {
		slug: string;
		status: string;
		site: BookSeoConfig & { url: string };
		previewAccess: PreviewAccessConfig;
		/** Who the reader is at the start, who they are at the end, and the change between. */
		objectives: {
			readerStart: string;
			readerEnd: string;
			transformation: string;
		};
		/** The frame the overview chapter follows; `steps` are its required sections. */
		frame: {
			slug: string;
			steps: readonly string[];
			intent: string;
		};
		/** The book's core claim about what causes the problem it covers. */
		causalStance: string;
		constraints: {
			mechanismCountTarget: readonly [number, number];
			actionPrimitiveMaxMinutes: number;
			examplesMustBeSwappable: boolean;
			orderingModel: string;
		};
		mechanisms: readonly BookConfigMechanism[];
		glossaryFocus: readonly string[];
		/** Copy on the home page; see `BookHomeConfig`. */
		home?: BookHomeConfig;
		/** Books listed under "Other books" on the home page. Leave empty for none. */
		relatedBooks?: readonly RelatedBook[];
		/**
		 * For a runbook book whose content is an example: the day (YYYY-MM-DD)
		 * `check:runbooks` judges review cadence on, instead of today, so its
		 * fixture dates never fall overdue. The check prints the date it used.
		 * Leave it out for real runbooks.
		 */
		reviewsAsOf?: string;
	};
