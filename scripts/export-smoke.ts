import {
	createEpubExport,
	createPdfExport,
	type ExportBundle,
} from "@bookkit/astro-bookkit/exports";
import { exitOnHelp } from "./lib/cli";

exitOnHelp({
	summary:
		"Makes an EPUB and a PDF from a small built-in sample, to check the\nexporters run. Writes nothing.",
	usage: ["bun run export:smoke"],
	examples: ["bun run export:smoke"],
});

const sampleBundle: ExportBundle = {
	title: "Bookkit Export Smoke Test",
	author: "Bookkit",
	version: "0.0.0",
	updatedAt: "2026-01-01",
	parts: [
		{
			title: "Chapters",
			entries: [
				{
					kind: "chapter",
					slug: "intro",
					title: "Introduction",
					body: "Welcome to the export smoke test.\n\n- Validate EPUB\n- Validate PDF",
				},
			],
		},
		{
			title: "Mechanisms and actions",
			entries: [
				{
					kind: "mechanism",
					slug: "smoke",
					title: "Smoke",
					body: "A mechanism with one action under it.",
					children: [
						{
							kind: "tool",
							slug: "check-exports",
							title: "Check the exports",
							body: "10 minutes\n\n## Steps\n\n1. Build.\n2. Open both files.",
						},
					],
				},
			],
		},
	],
};

const toKilobytes = (bytes: number) => (bytes / 1024).toFixed(1);

const run = async () => {
	const [epubBytes, pdfBytes] = await Promise.all([
		createEpubExport(sampleBundle),
		createPdfExport(sampleBundle),
	]);

	console.log(`EPUB export: ${toKilobytes(epubBytes.length)} KB`);
	console.log(`PDF export: ${toKilobytes(pdfBytes.length)} KB`);
};

run().catch((error) => {
	console.error("Export smoke test failed.", error);
	process.exit(1);
});
