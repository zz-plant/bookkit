import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createBookMcpEndpointFromWorkspace } from "@bookkit/astro-bookkit";

import bookConfig from "../../book.config";
import { bookEntryPoints } from "../../lib/book-entrypoints";

const currentDir = dirname(fileURLToPath(import.meta.url));

const { GET, POST } = createBookMcpEndpointFromWorkspace({
  startDir: currentDir,
  bookTitle: bookConfig.title,
  bookSlug: bookConfig.slug,
  bookDescription: bookConfig.site.defaultMeta.description,
  contentRawModules: bookEntryPoints.contentRawModules,
});

export { GET, POST };
