import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../_lib";
import { type BookExportData, loadBookExportData } from "./book-export-data";

export type BookJsonBundle = {
	$comment: string;
	schemaVersion: 1;
	version: string;
	book: BookExportData["meta"];
	chapters: BookExportData["chapters"];
	mechanisms: BookExportData["mechanisms"];
	tools: BookExportData["tools"];
	examples: BookExportData["examples"];
	glossary: BookExportData["glossary"];
	graph: {
		prerequisites: Array<{ from: string; to: string }>;
		chapterMechanisms: Array<{ chapter: string; mechanism: string }>;
		mechanismTools: Array<{ mechanism: string; tool: string }>;
		mechanismExamples: Array<{ mechanism: string; example: string }>;
	};
};

const COMMENT =
	"Compiled book knowledge bundle written by bookkit export --json. version changes whenever any content or config field changes.";

/** Builds a deterministic, versioned JSON knowledge bundle from book data. */
export function buildBookJsonBundle(data: BookExportData): BookJsonBundle {
	const graph = {
		prerequisites: data.chapters.flatMap((ch) =>
			ch.prerequisites.map((pre) => ({ from: pre, to: ch.slug })),
		),
		chapterMechanisms: data.chapters.flatMap((ch) =>
			ch.mechanisms.map((mech) => ({ chapter: ch.slug, mechanism: mech })),
		),
		mechanismTools: data.tools.map((tool) => ({
			mechanism: tool.mechanism,
			tool: tool.slug,
		})),
		mechanismExamples: data.examples.map((ex) => ({
			mechanism: ex.mechanism,
			example: ex.slug,
		})),
	};

	const payload = {
		schemaVersion: 1 as const,
		book: data.meta,
		chapters: data.chapters,
		mechanisms: data.mechanisms,
		tools: data.tools,
		examples: data.examples,
		glossary: data.glossary,
		graph,
	};
	const version = createHash("sha256")
		.update(JSON.stringify(payload))
		.digest("hex")
		.slice(0, 12);

	return {
		$comment: COMMENT,
		...payload,
		version,
	};
}

/** Exports `<book>` as a structured JSON knowledge bundle. */
export async function exportBookJson(
	book: string,
	outFile?: string,
): Promise<{ path: string; bundle: BookJsonBundle } | { error: string }> {
	const contentDir = join(repoRoot(), "apps", book, "src", "content", "book");
	if (!existsSync(contentDir)) {
		return { error: `No book "${book}" under apps/.` };
	}
	const data = await loadBookExportData(book);
	const bundle = buildBookJsonBundle(data);
	const path =
		outFile ?? join(repoRoot(), "apps", book, "exports", "book.json");
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(bundle, null, "\t")}\n`, "utf8");
	return { path, bundle };
}
