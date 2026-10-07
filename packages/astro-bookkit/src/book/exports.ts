import {
	type BookExportHelperOptions,
	createBookExportHelpers,
} from "../exports";

type BookExportConfig = {
	title: string;
	status?: string;
};

export type BookExportHelpersFromConfigOptions = Omit<
	BookExportHelperOptions,
	"book"
> & {
	bookConfig: BookExportConfig;
};

export const createBookExportHelpersFromConfig = (
	options: BookExportHelpersFromConfigOptions,
) => {
	const { bookConfig, modules, basePath, formats } = options;
	return createBookExportHelpers({
		book: {
			title: bookConfig.title,
			version: bookConfig.status,
		},
		modules,
		basePath,
		formats,
	});
};
