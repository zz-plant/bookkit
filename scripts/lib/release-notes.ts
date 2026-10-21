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

export type ReleaseFinding = {
	level: "error" | "warning";
	code: string;
	field?: string;
	message: string;
	fix: string;
};

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

/**
 * What the release notes page would do wrong with a note: leave it out (no
 * version or date), sort it out of place (a date that is not YYYY-MM-DD),
 * misread its version, or drop a summary or highlights of the wrong type.
 */
export const checkReleaseNote = (source: string): ReleaseFinding[] => {
	const { data } = parseFrontmatter(source);
	const findings: ReleaseFinding[] = [];
	const text = (value: unknown) =>
		typeof value === "string" ? value.trim() : "";
	const version = text(data.version);
	const date = text(data.date);
	const missing = [!version && "version", !date && "date"].filter(Boolean);
	if (missing.length > 0) {
		findings.push({
			level: "warning",
			code: "RELEASE_NOTE_INCOMPLETE",
			field: String(missing[0]),
			message: `Release note has no ${missing.join(" or ")}${typeof data.version === "number" ? ` (version is the number ${data.version}; quote it)` : ""}, so the release notes page leaves it out`,
			fix: 'Add version: "x.y.z" and date: "YYYY-MM-DD", quoted, or start one with bun run bookkit new release.',
		});
	}
	if (
		date &&
		(!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))
	) {
		findings.push({
			level: "warning",
			code: "RELEASE_NOTE_DATE",
			field: "date",
			message: `Release note date "${date}" is not a YYYY-MM-DD date, so it sorts out of place`,
			fix: 'Write the date as YYYY-MM-DD, e.g. date: "2026-10-20".',
		});
	}
	if (version && !isVersion(version)) {
		findings.push({
			level: "warning",
			code: "RELEASE_NOTE_VERSION",
			field: "version",
			message: `Release note version "${version}" is not x.y.z, so bookkit new release cannot number the next one after it`,
			fix: 'Write it as three numbers, e.g. version: "1.2.0".',
		});
	}
	if (!text(data.title)) {
		findings.push({
			level: "warning",
			code: "RELEASE_NOTE_FIELD",
			field: "title",
			message:
				"Release note has no title, so the release notes page names it by its version only",
			fix: 'Add title: "<what this version is called>".',
		});
	}
	if (
		data.summary !== undefined &&
		data.summary !== null &&
		typeof data.summary !== "string"
	) {
		findings.push({
			level: "warning",
			code: "RELEASE_NOTE_FIELD",
			field: "summary",
			message: "Release note summary is not text, so the page leaves it out",
			fix: 'Write summary: "<one sentence>" (a list belongs in highlights).',
		});
	}
	if (
		data.highlights !== undefined &&
		data.highlights !== null &&
		(!Array.isArray(data.highlights) ||
			data.highlights.some((item) => typeof item !== "string"))
	) {
		findings.push({
			level: "warning",
			code: "RELEASE_NOTE_FIELD",
			field: "highlights",
			message: Array.isArray(data.highlights)
				? "Release note highlights has an entry that is not a line of text; the page leaves it out"
				: "Release note highlights is not a list, so the page shows none",
			fix: 'Write highlights as a list, one line each:\nhighlights:\n  - "<a change worth naming>"',
		});
	}
	return findings;
};
