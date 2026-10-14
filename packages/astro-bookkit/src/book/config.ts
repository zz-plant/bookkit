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
 * Everything a book decides in `src/book.config.ts`. Each part is the type the
 * engine reads it as (layout, runtime, preview access, SEO), so a config that
 * satisfies this type type-checks wherever the app passes it to the engine.
 *
 *   export const bookConfig = { ... } as const satisfies BookConfig;
 */
export type BookConfig = BookLayoutConfig &
	BookRuntimeConfig & {
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
		/** Books listed under "Other books" on the home page. Leave empty for none. */
		relatedBooks?: readonly RelatedBook[];
	};
