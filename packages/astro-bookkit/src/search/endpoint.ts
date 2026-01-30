import {
  createBookSearchSources,
  createLocalizedSearchSources,
  type BookSearchModuleMap,
  type LocalizedSearchOptions,
} from "./sources";
import { createSearchIndexResponse } from "./index";

export const createBookSearchIndexEndpoint = (modules: BookSearchModuleMap) => {
  const sources = createBookSearchSources(modules);
  return {
    GET: () => createSearchIndexResponse(sources),
  };
};

export const createLocalizedSearchIndexEndpoint = (
  modules: BookSearchModuleMap,
  options: LocalizedSearchOptions = {}
) => {
  return {
    GET: (context: { request: Request }) => {
      const url = new URL(context.request.url);
      const localeParam = url.searchParams.get("locale") ?? undefined;
      const sources = createLocalizedSearchSources(modules, {
        ...options,
        locale: localeParam,
      });
      return createSearchIndexResponse(sources);
    },
  };
};
