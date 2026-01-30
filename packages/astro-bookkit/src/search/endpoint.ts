import { createBookSearchSources, type BookSearchModuleMap } from "./sources";
import { createSearchIndexResponse } from "./index";

export const createBookSearchIndexEndpoint = (modules: BookSearchModuleMap) => {
  const sources = createBookSearchSources(modules);
  return {
    GET: () => createSearchIndexResponse(sources),
  };
};
