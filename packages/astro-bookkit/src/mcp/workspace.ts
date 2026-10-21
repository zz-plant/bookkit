import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { BookContentRawModules } from "../book/entrypoints";

import { createBookMcpEndpoint } from "./endpoint";
import {
	CORE_GOVERNANCE_FILE_RESOURCES,
	createGovernanceResourcesFromFiles,
	GUIDE_GOVERNANCE_FILE_RESOURCES,
} from "./governance";

const GOVERNANCE_FILES = CORE_GOVERNANCE_FILE_RESOURCES.map(
	(resource) => resource.relativePath,
);

type CreateBookMcpEndpointFromWorkspaceOptions = {
	startDir: string;
	bookTitle: string;
	bookSlug?: string;
	bookDescription?: string;
	contentRawModules: BookContentRawModules;
};

const hasGovernanceFiles = (dirPath: string): boolean => {
	return GOVERNANCE_FILES.every((fileName) =>
		existsSync(resolve(dirPath, fileName)),
	);
};

/**
 * A Bookkit workspace: a package with book apps beside a copy of the engine.
 * A project made with create-bookkit has this layout but none of the
 * repository's governance files, and its apps have package.json files of
 * their own.
 */
const isBookkitLayout = (dirPath: string): boolean =>
	existsSync(resolve(dirPath, "package.json")) &&
	existsSync(resolve(dirPath, "apps")) &&
	existsSync(resolve(dirPath, "packages", "astro-bookkit"));

export const findWorkspaceRoot = (startDir: string): string => {
	let cursor = startDir;
	let nearestPackageJsonDir: string | undefined;

	for (;;) {
		if (hasGovernanceFiles(cursor) || isBookkitLayout(cursor)) {
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
		[...CORE_GOVERNANCE_FILE_RESOURCES, ...GUIDE_GOVERNANCE_FILE_RESOURCES],
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
