import type { z } from "zod";

export { type ChapterFrontmatter, chapterSchema } from "./chapter";
export { type ExampleFrontmatter, exampleSchema } from "./example";
export { type GlossaryFrontmatter, glossarySchema } from "./glossary";
export { type MechanismFrontmatter, mechanismSchema } from "./mechanism";
export {
	type ToolkitFrontmatter,
	toolkitDisplayName,
	toolkitSchema,
} from "./toolkit";

/**
 * Frontmatter as written in an MDX file, which is what pages read: the
 * schema's input type, so fields with defaults are optional, plus the
 * `locale` a translated entry carries (see localization/).
 */
export type AuthoredFrontmatter<TSchema extends z.ZodType> = z.input<TSchema> & {
	locale?: string;
};
