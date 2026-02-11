import { createBookMcpEndpoint, createGovernanceResourcesFromFiles } from "@bookkit/astro-bookkit";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import bookConfig from "../../book.config";
import { bookEntryPoints } from "../../lib/book-entrypoints";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(currentDir, "../../../../..");

const { GET, POST } = createBookMcpEndpoint({
  bookTitle: bookConfig.title,
  bookDescription: bookConfig.site.defaultMeta.description,
  contentRawModules: bookEntryPoints.contentRawModules,
  governanceResources: createGovernanceResourcesFromFiles(workspaceRoot),
});

export { GET, POST };
