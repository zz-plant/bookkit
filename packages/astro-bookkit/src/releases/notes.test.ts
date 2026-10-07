import { describe, expect, it } from "bun:test";

import { createLatestSectionChangeMap, createReleaseNotes } from "./notes";

describe("release note section change mapping", () => {
	it("normalizes changed sections and resolves latest section changes", () => {
		const releases = createReleaseNotes({
			"src/content/book/releases/2024-09-15.mdx": {
				frontmatter: {
					title: "Toolkit refresh",
					version: "0.2.0",
					date: "2024-09-15",
					summary: "Summary",
					highlights: ["one", " one ", "", 42],
					changedSections: [
						"toolkit",
						"mechanisms",
						" TOOLKIT ",
						"invalid_section",
					],
				},
			},
			"src/content/book/releases/2024-08-22.mdx": {
				frontmatter: {
					title: "Initial",
					version: "0.1.0",
					date: "2024-08-22",
					summary: "Summary",
					highlights: ["one"],
					changedSections: ["overview", "chapters", "toolkit"],
				},
			},
		});

		expect(releases[0].changedSections).toEqual(["toolkit", "mechanisms"]);
		expect(releases[0].highlights).toEqual(["one", "one"]);

		const latestBySection = createLatestSectionChangeMap(releases);
		expect(latestBySection.toolkit.version).toBe("0.2.0");
		expect(latestBySection.chapters.version).toBe("0.1.0");
		expect(releases[0].sectionChangeSource).toBe("manual");
	});

	it("derives changed sections from section snapshot diffs when provided", () => {
		const releases = createReleaseNotes({
			"src/content/book/releases/2024-09-15.mdx": {
				frontmatter: {
					title: "Toolkit refresh",
					version: "0.2.0",
					date: "2024-09-15",
					summary: "Summary",
					changedSections: ["overview"],
					sectionSnapshots: {
						overview: "hash-overview-v1",
						toolkit: "hash-toolkit-v2",
					},
				},
			},
			"src/content/book/releases/2024-08-22.mdx": {
				frontmatter: {
					title: "Initial",
					version: "0.1.0",
					date: "2024-08-22",
					summary: "Summary",
					sectionSnapshots: {
						overview: "hash-overview-v1",
						toolkit: "hash-toolkit-v1",
					},
				},
			},
		});

		expect(releases[0].changedSections).toEqual(["toolkit"]);
		expect(releases[0].sectionChangeSource).toBe("snapshot-diff");
		expect(releases[1].changedSections).toEqual(["overview", "toolkit"]);
		expect(releases[1].sectionChangeSource).toBe("snapshot-diff");
	});
});
