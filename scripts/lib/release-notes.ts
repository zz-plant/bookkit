import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { versionParts } from "../../packages/astro-bookkit/src/validators/release-note";
import { parseFrontmatter } from "./content-frontmatter";

export {
	checkReleaseNote,
	isVersion,
} from "../../packages/astro-bookkit/src/validators/release-note";

/**
 * `bookkit new release`: a dated release note in the book's releases/, in
 * the shape the release notes page reads (title, version, date, summary,
 * highlights). The version is the latest one's next minor unless given.
 */

/** Versions in the book's release notes, as written. */
export const releaseVersions = (releasesDir: string): string[] =>
	existsSync(releasesDir)
		? readdirSync(releasesDir)
				.filter((name) => /\.mdx?$/.test(name))
				.flatMap((name) => {
					const { data } = parseFrontmatter(
						readFileSync(join(releasesDir, name), "utf8"),
					);
					return typeof data.version === "string" ? [data.version] : [];
				})
		: [];

/** The next minor version after the highest x.y.z among `versions`; 0.1.0 when there is none. */
export const nextMinorVersion = (versions: readonly string[]): string => {
	const highest = versions
		.map(versionParts)
		.filter((value): value is number[] => value !== null)
		.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
		.pop();
	return highest ? `${highest[0]}.${highest[1] + 1}.0` : "0.1.0";
};

/** A release note's source, with what to fill in left as comments. */
export const releaseSource = (note: {
	title: string;
	version: string;
	date: string;
}): string => `---
title: ${JSON.stringify(note.title)}
version: ${JSON.stringify(note.version)}
date: ${JSON.stringify(note.date)}
summary: "" # One sentence: what changed for readers.
highlights: [] # The changes worth naming, one line each.
---

{/* What changed in this version, for readers. The release notes page lists it with its version and date. */}
`;

/** The fields of a release note, for `bookkit contract release`. */
export const RELEASE_FIELDS = [
	{
		name: "title",
		whenMissing: "warning",
		meaning: "What this version is called on the release notes page.",
	},
	{
		name: "version",
		whenMissing: "warning",
		meaning:
			'x.y.z, quoted ("0.2.0"); without it the page leaves the note out.',
	},
	{
		name: "date",
		whenMissing: "warning",
		meaning: 'YYYY-MM-DD, quoted ("2026-10-20"); the page sorts by it.',
	},
	{
		name: "summary",
		whenMissing: "optional",
		meaning: "One sentence: what changed for readers.",
	},
	{
		name: "highlights",
		whenMissing: "optional",
		meaning: "The changes worth naming, one line each (a list).",
	},
	{
		name: "changedSections",
		whenMissing: "optional",
		meaning:
			"Sections that changed (chapters, mechanisms, toolkit, glossary, examples), linked from the note.",
	},
] as const;
