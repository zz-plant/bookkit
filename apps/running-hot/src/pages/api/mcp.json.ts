import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createBookMcpEndpoint, createGovernanceResourcesFromFiles } from "@bookkit/astro-bookkit";

import bookConfig from "../../book.config";
import { bookEntryPoints } from "../../lib/book-entrypoints";

const GOVERNANCE_FILES = ["README.md", "CONTRIBUTING.md", "AGENTS.md"];

const findWorkspaceRoot = (startDir: string): string => {
  let cursor = startDir;

  for (;;) {
    const hasGovernanceFiles = GOVERNANCE_FILES.every((fileName) =>
      existsSync(resolve(cursor, fileName)),
    );

    if (hasGovernanceFiles) {
      return cursor;
    }

    const parentDir = dirname(cursor);

    if (parentDir === cursor) {
      break;
    }

    cursor = parentDir;
  }

  return process.cwd();
};

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = findWorkspaceRoot(currentDir);

const { GET, POST } = createBookMcpEndpoint({
  bookTitle: bookConfig.title,
  bookSlug: bookConfig.slug,
  bookDescription: bookConfig.site.defaultMeta.description,
  contentRawModules: bookEntryPoints.contentRawModules,
  workspaceRoot,
  governanceResources: createGovernanceResourcesFromFiles(workspaceRoot),
});

export { GET, POST };
