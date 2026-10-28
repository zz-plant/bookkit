import { parseFrontmatter } from "../utils/frontmatter";

/**
 * A release note as the release notes page reads it: what the page would
 * leave out, sort out of place, or misread. `checkBookContent` reports it for
 * every note in a book, and `bookkit check <releases/file.mdx>` for one.
 */

export type ReleaseNoteFinding = {
	level: "error" | "warning";
	code: string;
	field?: string;
	message: string;
	fix: string;
};

/** The numbers of an x.y.z version (a leading `v` allowed); null for anything else. */
export const versionParts = (version: string): number[] | null => {
	const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
	return match ? match.slice(1).map(Number) : null;
};

export const isVersion = (value: string): boolean =>
	versionParts(value) !== null;

/**
 * What the release notes page would do wrong with a note: leave it out (no
 * version or date), sort it out of place (a date that is not YYYY-MM-DD),
 * misread its version, or drop a summary or highlights of the wrong type.
 */
export const checkReleaseNote = (source: string): ReleaseNoteFinding[] => {
	const parsed = parseFrontmatter(source);
	const data: Record<string, unknown> =
		parsed.status === "ok" ? parsed.data : {};
	const findings: ReleaseNoteFinding[] = [];
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
