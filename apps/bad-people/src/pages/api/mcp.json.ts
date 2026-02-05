import { createBookMcpEndpoint } from "@bookkit/astro-bookkit";

import bookConfig from "../../book.config";
import { bookEntryPoints } from "../../lib/book-entrypoints";

const { GET, POST } = createBookMcpEndpoint({
  bookTitle: bookConfig.title,
  bookDescription: bookConfig.site.defaultMeta.description,
  contentRawModules: bookEntryPoints.contentRawModules,
});

export { GET, POST };
