import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { extractPdfText } from "../inspect";
import type { ExportBundle, ExportEntry } from "../types";

/** Test helpers for reading back what the exports wrote. */

/** A book of chapters, each `[slug, body]` titled by its slug. */
export const chaptersBundle = (
	chapters: Array<[string, string]>,
	extra: Partial<ExportBundle> = {},
): ExportBundle => ({
	title: "Probe",
	updatedAt: "2026-01-01",
	...extra,
	parts: [
		{
			title: "Chapters",
			entries: chapters.map(
				([slug, body]): ExportEntry => ({
					kind: "chapter",
					slug,
					title: slug,
					body,
				}),
			),
		},
	],
});

/**
 * Each page's text in drawing order: runs on one baseline joined, a new line
 * where the baseline moves by more than a raised note number does.
 */
export const pdfPages = async (bytes: Uint8Array) =>
	(await extractPdfText(bytes)).map((runs) => {
		let text = "";
		let baseline: number | undefined;
		for (const run of runs) {
			if (baseline !== undefined && Math.abs(run.y - baseline) > 5) {
				text += "\n";
			}
			if (baseline === undefined || Math.abs(run.y - baseline) > 5) {
				baseline = run.y;
			}
			text += run.text;
		}
		return text;
	});

/** The strings `text` lacks, each looked for after the one before it. */
export const missingInOrder = (text: string, expected: string[]) => {
	const missing: string[] = [];
	let from = 0;
	for (const part of expected) {
		const at = text.indexOf(part, from);
		if (at === -1) missing.push(part);
		else from = at + part.length;
	}
	return missing;
};

/** A chapter's XHTML from an EPUB the exports wrote. */
export const epubChapter = async (epub: Uint8Array, slug: string) =>
	(await (
		await JSZip.loadAsync(epub)
	)
		.file(`OEBPS/text/chapter-${slug}.xhtml`)
		?.async("string")) ?? "";

/** The XHTML inside a chapter's <article>, after its title. */
export const articleBody = (xhtml: string) =>
	xhtml
		.slice(xhtml.indexOf("</h1>") + 5, xhtml.lastIndexOf("</article>"))
		.trim();

/**
 * epubcheck's summary line for `epub`, run with `--usage`, when
 * EPUBCHECK_JAR names the official W3C release (Java from JAVA or PATH).
 */
export const epubcheck = (epub: Uint8Array, scratch: string, name: string) => {
	const file = join(scratch, `${name}.epub`);
	writeFileSync(file, epub);
	const result = spawnSync(
		process.env.JAVA ?? "java",
		["-jar", process.env.EPUBCHECK_JAR ?? "", "--usage", file],
		{ encoding: "utf8" },
	);
	return `${result.stdout}${result.stderr}`;
};

export const EPUBCHECK_CLEAN =
	"Messages: 0 fatals / 0 errors / 0 warnings / 0 infos / 0 usages";
