import { describe, expect, it } from "bun:test";
import {
	appendFileSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { previewFolder } from "../../packages/astro-bookkit/src/proposals";
import { mdxConversionSummary, readFolder } from "./folder-report";
import { planImport } from "./import-markdown";
import {
	countConversions,
	describeConversions,
	sumConversions,
} from "./import-rules";

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

describe("bookkit try's MDX summary", () => {
	it("counts what import converts, in import's words, leaving out what import skips", async () => {
		const workspace = mkdtempSync(join(tmpdir(), "bookkit-try-"));
		try {
			const notes = join(workspace, "notes");
			cpSync(join(import.meta.dir, "fixtures", "import-notes"), notes, {
				recursive: true,
			});
			// A prose line that starts with `export`, which MDX would run as code.
			writeFileSync(
				join(notes, "08-exporting.md"),
				"# Exporting\n\nexport the data first, then check it.\n",
			);
			// Import skips a README, so its braces are not converted.
			appendFileSync(join(notes, "README.md"), "\nFill in {owner}.\n");
			mkdirSync(
				join(workspace, "apps", "notes-book", "src", "content", "book"),
				{ recursive: true },
			);

			const folder = readFolder(notes);
			if ("error" in folder) throw new Error(folder.error);
			const summary = mdxConversionSummary(previewFolder(folder.files));

			const plan = await planImport({
				workspaceRoot: workspace,
				book: "notes-book",
				sourceDir: notes,
			});
			const converted = plan.chapters
				.map((chapter) => chapter.changes)
				.filter((changes) => countConversions(changes) > 0);
			expect(summary).toBe(
				`Import would convert ${converted.length} documents so they compile as MDX: ${describeConversions(sumConversions(converted))}.`,
			);
			expect(summary).toContain("2 import/export lines escaped");
			expect(summary).toContain("HTML tags kept as HTML");
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("says nothing when no note needs converting", () => {
		const folder = readFolder(tree({ "a.md": "# A\n\nPlain prose." }));
		if ("error" in folder) throw new Error(folder.error);
		expect(mdxConversionSummary(previewFolder(folder.files))).toBeNull();
	});
});
