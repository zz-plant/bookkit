import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import {
	createLatestSectionChangeMap,
	createReleaseNotes,
	formatReleaseDate,
} from "./notes";

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

/** formatReleaseDate's output for each value, in a process whose time zone is `zone`. */
const formatIn = (zone: string, values: string[]): string[] => {
	const result = Bun.spawnSync(
		[
			process.execPath,
			"-e",
			`const { formatReleaseDate } = await import(${JSON.stringify(join(import.meta.dir, "notes.ts"))});
console.log(JSON.stringify(${JSON.stringify(values)}.map((value) => formatReleaseDate(value))));`,
		],
		{ env: { ...process.env, TZ: zone }, stdout: "pipe", stderr: "pipe" },
	);
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return JSON.parse(result.stdout.toString());
};

describe("formatReleaseDate", () => {
	it("shows the calendar date written, whatever the build machine's time zone", () => {
		const values = ["2026-02-10", "2026-02-10T23:30:00-06:00", "2026-12-31"];
		const expected = [
			"February 10, 2026",
			"February 10, 2026",
			"December 31, 2026",
		];
		// West of Greenwich (Chicago, Honolulu), east of it (Tokyo), and on it.
		for (const zone of [
			"America/Chicago",
			"Pacific/Honolulu",
			"Asia/Tokyo",
			"UTC",
		]) {
			expect(formatIn(zone, values)).toEqual(expected);
		}
	});

	it("reads a date YAML parsed as a Date, and leaves text with no date as written", () => {
		expect(formatReleaseDate(new Date("2026-02-10T00:00:00Z"))).toBe(
			"February 10, 2026",
		);
		expect(formatReleaseDate("2026-02-30")).toBe("2026-02-30");
		expect(formatReleaseDate("soon")).toBe("soon");
	});
});
