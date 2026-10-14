import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readFolder } from "./folder-report";

const tree = (files: Record<string, string>): string => {
	const root = mkdtempSync(join(tmpdir(), "bookkit-folder-"));
	for (const [path, source] of Object.entries(files)) {
		mkdirSync(join(root, path, ".."), { recursive: true });
		writeFileSync(join(root, path), source);
	}
	return root;
};

describe("readFolder", () => {
	it("reads Markdown below a folder, skipping dependencies and dot folders", () => {
		const root = tree({
			"a.md": "# A",
			"ops/b.mdx": "# B",
			"notes.txt": "not markdown",
			"node_modules/pkg/README.md": "# dependency",
			".git/HEAD.md": "# hidden",
		});
		const folder = readFolder(root);
		if ("error" in folder) throw new Error(folder.error);
		expect(folder.files.map((file) => file.path).sort()).toEqual([
			"a.md",
			"ops/b.mdx",
		]);
	});

	it("keeps a single file's section folder in its path", () => {
		const root = tree({ "book/toolkit/check.mdx": "---\nname: x\n---" });
		const folder = readFolder(join(root, "book/toolkit/check.mdx"));
		if ("error" in folder) throw new Error(folder.error);
		expect(folder.files.map((file) => file.path)).toEqual([
			"book/toolkit/check.mdx",
		]);
	});

	it("says where it looked when nothing is there", () => {
		const missing = readFolder(join(tmpdir(), "bookkit-no-such-folder"));
		expect("error" in missing && missing.error).toContain(
			"No such file or folder",
		);
		const empty = readFolder(tree({ "notes.txt": "x" }));
		expect("error" in empty && empty.error).toContain("No Markdown");
	});
});
