import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { BookContentRawModules } from "../book/entrypoints";

import { createBookMcpEndpoint } from "./endpoint";
import {
  CORE_GOVERNANCE_FILE_RESOURCES,
  createGovernanceResourcesFromFiles,
} from "./governance";

const GOVERNANCE_FILES = CORE_GOVERNANCE_FILE_RESOURCES.map((resource) => resource.relativePath);

type CreateBookMcpEndpointFromWorkspaceOptions = {
  startDir: string;
  bookTitle: string;
  bookSlug?: string;
  bookDescription?: string;
  contentRawModules: BookContentRawModules;
};

const hasGovernanceFiles = (dirPath: string): boolean => {
  return GOVERNANCE_FILES.every((fileName) => existsSync(resolve(dirPath, fileName)));
};

export const findWorkspaceRoot = (startDir: string): string => {
  let cursor = startDir;
  let nearestPackageJsonDir: string | undefined;

  for (;;) {
    if (hasGovernanceFiles(cursor)) {
      return cursor;
    }

    if (!nearestPackageJsonDir && existsSync(resolve(cursor, "package.json"))) {
      nearestPackageJsonDir = cursor;
    }

    const parentDir = dirname(cursor);
    if (parentDir === cursor) {
      break;
    }

    cursor = parentDir;
  }

  return nearestPackageJsonDir ?? process.cwd();
};

export const createBookMcpEndpointFromWorkspace = (
  options: CreateBookMcpEndpointFromWorkspaceOptions,
) => {
  const workspaceRoot = findWorkspaceRoot(options.startDir);
  const governanceResources = createGovernanceResourcesFromFiles(
    workspaceRoot,
    CORE_GOVERNANCE_FILE_RESOURCES,
    { allowMissingFiles: true },
  );

  return createBookMcpEndpoint({
    bookTitle: options.bookTitle,
    bookSlug: options.bookSlug,
    bookDescription: options.bookDescription,
    contentRawModules: options.contentRawModules,
    workspaceRoot,
    governanceResources,
  });
};

export type { CreateBookMcpEndpointFromWorkspaceOptions };
