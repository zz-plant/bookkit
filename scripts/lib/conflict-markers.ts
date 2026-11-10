/**
 * Conflict markers a merge left behind. Every other gate can pass with one in
 * a Markdown or JSON file, so `verify` looks for them first.
 *
 * `=======` alone is not a marker here: it is also a Markdown heading
 * underline, and a real conflict always has one of the other three.
 */

const MARKER = /^(<{7} |>{7} |\|{7} )/;

export type ConflictMarker = { file: string; line: number; text: string };

/** The marker lines in one file's text, 1-based. */
export const conflictMarkersIn = (
	file: string,
	source: string,
): ConflictMarker[] =>
	source
		.split("\n")
		.flatMap((text, index) =>
			MARKER.test(text)
				? [{ file, line: index + 1, text: text.trimEnd() }]
				: [],
		);
