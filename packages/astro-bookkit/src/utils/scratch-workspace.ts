import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Tests build books in scratch workspaces, never in the repository's apps/
 * (scripts/lib/book-workspace.fixture.ts). A scratch workspace sits inside
 * the repository, so code that finds the workspace root by walking up from
 * its folder lands on the repository once the scratch workspace is deleted
 * under it (a stopped test run removes it), and then writes books into, or
 * deletes them from, the real apps/.
 *
 * So a scratch workspace holds SCRATCH_WORKSPACE_MARKER, every process a
 * test starts in one is given its folder in SCRATCH_WORKSPACE_ENV, and code
 * that resolves a workspace root asks `scratchWorkspaceRoot` before walking:
 * in a scratch workspace the answer is that workspace or an error, never a
 * folder above it.
 */
export const SCRATCH_WORKSPACE_ENV = "BOOKKIT_SCRATCH_WORKSPACE";
export const SCRATCH_WORKSPACE_MARKER = ".bookkit-scratch-workspace";

/** `path` with symbolic links resolved, as far as it still exists. */
const realPath = (path: string): string => {
	const parts = resolve(path).split(sep);
	for (let end = parts.length; end > 1; end -= 1) {
		const existing = parts.slice(0, end).join(sep) || sep;
		if (existsSync(existing)) {
			return join(realpathSync(existing), ...parts.slice(end));
		}
	}
	return resolve(path);
};

const isInside = (folder: string, path: string): boolean => {
	const rel = relative(folder, path);
	return rel === "" || (!isAbsolute(rel) && rel.split(sep)[0] !== "..");
};

/**
 * `parts` resolved against the scratch workspace `workspace`. Throws if the
 * path is outside it, or if the workspace no longer holds its marker: it was
 * deleted, or is being deleted, and a path there could reach the repository.
 */
export const insideScratchWorkspace = (
	workspace: string,
	...parts: string[]
): string => {
	const root = realPath(workspace);
	const path = realPath(resolve(root, ...parts));
	if (!isInside(root, path)) {
		throw new Error(
			`${path} is outside the scratch workspace ${root}. A test may read and write only inside its scratch workspace.`,
		);
	}
	if (!existsSync(join(root, SCRATCH_WORKSPACE_MARKER))) {
		throw new Error(
			`The scratch workspace ${root} has no ${SCRATCH_WORKSPACE_MARKER}: it was deleted while a test used it. Refusing ${path} rather than resolving a folder above it, which would be the repository.`,
		);
	}
	return path;
};

/**
 * The scratch workspace this process was started in (SCRATCH_WORKSPACE_ENV),
 * after checking that `dir` is inside it and that it still holds its marker;
 * undefined when the process was not started in one.
 */
export const scratchWorkspaceRoot = (dir: string): string | undefined => {
	const workspace = globalThis.process?.env?.[SCRATCH_WORKSPACE_ENV]?.trim();
	if (!workspace) return undefined;
	insideScratchWorkspace(workspace, dir);
	return realPath(workspace);
};
