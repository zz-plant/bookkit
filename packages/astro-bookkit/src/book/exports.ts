import {
	type BookExportHelperOptions,
	createBookExportHelpers,
} from "../exports";

type BookExportConfig = {
	title: string;
	slug?: string;
	status?: string;
	author?: { name: string };
	site?: { url?: string };
	localization?: { defaultLocale?: string };
	mechanisms?: ReadonlyArray<{ slug: string }>;
};

/** The release an export describes: the book's latest release note. */
export type BookExportRelease = {
	version?: string;
	date?: string;
};

export type BookExportHelpersFromConfigOptions = Omit<
	BookExportHelperOptions,
	"book"
> & {
	bookConfig: BookExportConfig;
	release?: BookExportRelease;
};

/**
 * SOURCE_DATE_EPOCH (reproducible-builds.org) dates the export of a book
 * that has no dated release yet; the build time never does.
 */
const sourceDateEpoch = (): string | undefined => {
	const raw = globalThis.process?.env?.SOURCE_DATE_EPOCH?.trim();
	if (!raw || !/^\d+$/.test(raw)) return undefined;
	return new Date(Number(raw) * 1000).toISOString();
};

export const createBookExportHelpersFromConfig = (
	options: BookExportHelpersFromConfigOptions,
) => {
	const { bookConfig, release, modules, basePath, formats } = options;
	return createBookExportHelpers({
		book: {
			title: bookConfig.title,
			slug: bookConfig.slug,
			author: bookConfig.author?.name,
			siteUrl: bookConfig.site?.url,
			language: bookConfig.localization?.defaultLocale,
			version: release?.version || undefined,
			updatedAt: release?.date || sourceDateEpoch(),
			draft: bookConfig.status === "draft",
			mechanismOrder: bookConfig.mechanisms?.map((mechanism) => mechanism.slug),
		},
		modules,
		basePath,
		formats,
	});
};
