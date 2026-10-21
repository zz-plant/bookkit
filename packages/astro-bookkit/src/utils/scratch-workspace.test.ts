import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	insideScratchWorkspace,
	SCRATCH_WORKSPACE_ENV,
	SCRATCH_WORKSPACE_MARKER,
	scratchWorkspaceRoot,
} from "./scratch-workspace";

/** A repository holding a scratch workspace, as book-workspace.fixture.ts lays them out. */
let repo: string;
let workspace: string;
let saved: string | undefined;

beforeEach(() => {
	repo = realpathSync(mkdtempSync(join(tmpdir(), "bookkit-scratch-")));
	mkdirSync(join(repo, "apps", "real-book"), { recursive: true });
	workspace = join(repo, ".test-workspaces", "probe-abc");
	mkdirSync(join(workspace, "apps", "probe-book"), { recursive: true });
	writeFileSync(join(workspace, SCRATCH_WORKSPACE_MARKER), "");
	saved = process.env[SCRATCH_WORKSPACE_ENV];
});

afterEach(() => {
	if (saved === undefined) delete process.env[SCRATCH_WORKSPACE_ENV];
	else process.env[SCRATCH_WORKSPACE_ENV] = saved;
	rmSync(repo, { recursive: true, force: true });
});

describe("insideScratchWorkspace", () => {
	it("resolves a path inside the workspace, existing or not", () => {
		expect(insideScratchWorkspace(workspace, "apps", "probe-book")).toBe(
			join(workspace, "apps", "probe-book"),
		);
		expect(insideScratchWorkspace(workspace, "apps", "new-book", "x")).toBe(
			join(workspace, "apps", "new-book", "x"),
		);
		expect(insideScratchWorkspace(workspace)).toBe(workspace);
	});

	it("refuses a path that leaves the workspace, by .., by an absolute path, or through a link", () => {
		expect(() => insideScratchWorkspace(workspace, "..", "..", "apps")).toThrow(
			`${join(repo, "apps")} is outside the scratch workspace ${workspace}.`,
		);
		expect(() =>
			insideScratchWorkspace(workspace, join(repo, "apps", "real-book")),
		).toThrow("is outside the scratch workspace");
		symlinkSync(join(repo, "apps"), join(workspace, "linked"));
		expect(() =>
			insideScratchWorkspace(workspace, "linked", "real-book"),
		).toThrow(
			`${join(repo, "apps", "real-book")} is outside the scratch workspace`,
		);
	});

	it("refuses every path once the marker is gone, the workspace deleted or not", () => {
		rmSync(join(workspace, SCRATCH_WORKSPACE_MARKER));
		expect(() => insideScratchWorkspace(workspace, "apps")).toThrow(
			`The scratch workspace ${workspace} has no ${SCRATCH_WORKSPACE_MARKER}: it was deleted while a test used it.`,
		);
		rmSync(workspace, { recursive: true });
		expect(() => insideScratchWorkspace(workspace, "apps", "x")).toThrow(
			"has no .bookkit-scratch-workspace",
		);
	});
});

describe("scratchWorkspaceRoot", () => {
	it("is undefined in a process no test started in a scratch workspace", () => {
		delete process.env[SCRATCH_WORKSPACE_ENV];
		expect(scratchWorkspaceRoot(join(repo, "apps"))).toBeUndefined();
	});

	it("is the workspace, from any folder in it", () => {
		process.env[SCRATCH_WORKSPACE_ENV] = workspace;
		expect(scratchWorkspaceRoot(join(workspace, "apps", "probe-book"))).toBe(
			workspace,
		);
	});

	it("throws rather than answer for a folder outside it, or once it is deleted", () => {
		process.env[SCRATCH_WORKSPACE_ENV] = workspace;
		expect(() => scratchWorkspaceRoot(repo)).toThrow(
			`${repo} is outside the scratch workspace ${workspace}.`,
		);
		rmSync(workspace, { recursive: true });
		expect(() =>
			scratchWorkspaceRoot(join(workspace, "apps", "probe-book")),
		).toThrow("it was deleted while a test used it");
	});
});
