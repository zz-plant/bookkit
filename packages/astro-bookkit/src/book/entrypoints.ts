import type { MDXInstance } from "astro";
import type { ReleaseModule } from "../releases/notes";
import type {
	AuthoredFrontmatter,
	chapterSchema,
	exampleSchema,
	glossarySchema,
	mechanismSchema,
	toolkitSchema,
} from "../schemas";

/**
 * One eagerly globbed MDX file per content section. Book apps pass these as
 * the type argument to `import.meta.glob` so pages see typed frontmatter.
 */
export type ChapterModule = MDXInstance<
	AuthoredFrontmatter<typeof chapterSchema>
>;
export type MechanismModule = MDXInstance<
	AuthoredFrontmatter<typeof mechanismSchema>
>;
export type ToolkitModule = MDXInstance<
	AuthoredFrontmatter<typeof toolkitSchema>
>;
export type GlossaryModule = MDXInstance<
	AuthoredFrontmatter<typeof glossarySchema>
>;
export type ExampleModule = MDXInstance<
	AuthoredFrontmatter<typeof exampleSchema>
>;

export type BookContentModules = {
	chapters: Record<string, ChapterModule>;
	mechanisms: Record<string, MechanismModule>;
	toolkit: Record<string, ToolkitModule>;
	glossary: Record<string, GlossaryModule>;
	examples: Record<string, ExampleModule>;
};

export type BookContentRawModules = {
	chapters: Record<string, string>;
	mechanisms: Record<string, string>;
	toolkit: Record<string, string>;
	glossary: Record<string, string>;
	examples: Record<string, string>;
};

export type BookEntryPoints = {
	contentModules: BookContentModules;
	contentRawModules: BookContentRawModules;
	localizedContentModules: Array<BookContentModules[keyof BookContentModules]>;
	releaseModules: Record<string, ReleaseModule>;
};

export type BookEntryPointsOptions = {
	contentModules: BookContentModules;
	contentRawModules: BookContentRawModules;
	releaseModules: Record<string, ReleaseModule>;
};

export const createBookEntryPoints = (
	options: BookEntryPointsOptions,
): BookEntryPoints => {
	const { contentModules, contentRawModules, releaseModules } = options;

	return {
		contentModules,
		contentRawModules,
		localizedContentModules: [
			contentModules.chapters,
			contentModules.mechanisms,
			contentModules.toolkit,
			contentModules.glossary,
			contentModules.examples,
		],
		releaseModules,
	};
};
