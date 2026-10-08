import {
	frontmatterTextFields,
	parseFrontmatter as parseSharedFrontmatter,
} from "../utils/frontmatter";
import type { ExportChapter } from "./types";

/** Scalar frontmatter fields as text, and the body (see utils/frontmatter.ts). */
export const parseFrontmatter = (raw: string) => {
	const parsed = parseSharedFrontmatter(raw);
	return { data: frontmatterTextFields(parsed.data), body: parsed.body };
};

export const buildExportChapters = (
	modules: Record<string, string>,
): ExportChapter[] => {
	return Object.entries(modules)
		.sort(([pathA], [pathB]) => pathA.localeCompare(pathB))
		.map(([path, raw]) => {
			const { data, body } = parseFrontmatter(raw);
			const slug =
				data.slug ??
				path
					.split("/")
					.pop()
					?.replace(/\.mdx?$/, "") ??
				"chapter";
			return {
				slug,
				title: data.title ?? slug,
				body,
				description: data.summary ?? data.description,
				locale: data.locale ?? undefined,
			};
		})
		.filter((chapter) => chapter.slug);
};
