import { createSearchIndexGetHandler } from "../../app-wrappers";
import { bookEntryPoints } from "../runtime";

export const GET = createSearchIndexGetHandler({
	modules: bookEntryPoints.contentRawModules,
	defaultLocale: "en",
});
