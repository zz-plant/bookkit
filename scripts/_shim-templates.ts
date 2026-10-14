import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { listBookDirs, listFilesRecursive, repoRoot } from "./_lib";

/**
 * Wrapper files every book app holds identical copies of. The canonical copy
 * of each is in the engine's templates/book-app/; every file there is a shim,
 * so a file added to the template is synced and checked without being listed
 * anywhere else.
 */

export const shimTemplateRootIn = (root: string) =>
	join(root, "packages", "astro-bookkit", "templates", "book-app");

export const shimTemplateRoot = shimTemplateRootIn(repoRoot());

/** Paths, relative to a book app, of every shim the engine defines under `root`. */
export const listShimPaths = (root: string = repoRoot()): string[] =>
	existsSync(shimTemplateRootIn(root))
		? listFilesRecursive(shimTemplateRootIn(root))
		: [];

export const shimPaths = listShimPaths();

export const listShimBooks = () => listBookDirs();

export const getShimTemplatePath = (relativePath: string) =>
	join(shimTemplateRoot, relativePath);
export const getBookShimPath = (book: string, relativePath: string) =>
	join(repoRoot(), "apps", book, relativePath);

export const readShimTemplate = (relativePath: string) => {
	const templatePath = getShimTemplatePath(relativePath);
	if (!existsSync(templatePath)) {
		throw new Error(`Missing shim template: ${templatePath}`);
	}
	return readFileSync(templatePath, "utf8");
};

/** Copies every shim into apps/<book>/ under `root`; returns the paths written. */
export const syncShimTemplatesToBook = (
	book: string,
	root: string = repoRoot(),
): string[] => {
	const paths = listShimPaths(root);
	if (paths.length === 0) {
		throw new Error(
			`No shim templates found in ${shimTemplateRootIn(root)}. Is the engine at packages/astro-bookkit?`,
		);
	}
	for (const relativePath of paths) {
		const targetPath = join(root, "apps", book, relativePath);
		mkdirSync(dirname(targetPath), { recursive: true });
		copyFileSync(join(shimTemplateRootIn(root), relativePath), targetPath);
	}
	return paths;
};
