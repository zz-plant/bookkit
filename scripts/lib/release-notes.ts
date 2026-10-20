import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./content-frontmatter";

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

const parts = (version: string): number[] | null => {
	const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
	return match ? match.slice(1).map(Number) : null;
};

/** The next minor version after the highest x.y.z among `versions`; 0.1.0 when there is none. */
export const nextMinorVersion = (versions: readonly string[]): string => {
	const highest = versions
		.map(parts)
		.filter((value): value is number[] => value !== null)
		.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
		.pop();
	return highest ? `${highest[0]}.${highest[1] + 1}.0` : "0.1.0";
};

export const isVersion = (value: string): boolean => parts(value) !== null;

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
