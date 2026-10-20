import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import {
	extractPdfText,
	inspectEpub,
	inspectPdf,
} from "../../packages/astro-bookkit/src/exports/inspect";
import { createBookWorkspace, runBun as run } from "./book-workspace.fixture";

/**
 * The PDF and EPUB of a real build: notes imported with their image, plus a
 * chapter in Russian and Greek. Then a chapter in Chinese, which the PDF has
 * no font for, and the same book with its PDF turned off. check:build judges
 * each dist/. The book lives in a scratch workspace; apps/ is untouched.
 */

const REPO = join(import.meta.dir, "..", "..");
const FIXTURE = join(import.meta.dir, "fixtures", "import-notes");
const BOOK = "export-book";

let workspace: string;
let appDir: string;

beforeAll(() => {
	({ workspace, appDir } = createBookWorkspace("export-build-", BOOK));
});

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

const chapter = (file: string, title: string, body: string) =>
	writeFileSync(
		join(appDir, "src", "content", "book", "chapters", file),
		`---\ntitle: ${title}\nsummary: ${title}.\nstatus: draft\n---\n\n${body}\n`,
	);
const dist = (...path: string[]) => join(appDir, "dist", ...path);
const checkBuild = () =>
	run([join(REPO, "scripts", "check-build.ts"), "--book", BOOK], workspace);

/** Images the PDF embeds, not counting the transparency masks of PNGs. */
const imageCount = async (bytes: Uint8Array) => {
	const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
	const images = pdf.context
		.enumerateIndirectObjects()
		.filter(
			([, object]) =>
				object instanceof PDFRawStream &&
				object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image",
		);
	const masks = new Set(
		images.map(([, object]) =>
			(object as PDFRawStream).dict.get(PDFName.of("SMask"))?.toString(),
		),
	);
	return images.filter(([ref]) => !masks.has(ref.toString())).length;
};

describe("PDF and EPUB exports in a build", () => {
	it("carry imported images and Cyrillic and Greek text", async () => {
		const imported = run(
			[
				join(REPO, "scripts", "import-book-from-markdown.ts"),
				"--book",
				BOOK,
				"--dir",
				FIXTURE,
			],
			workspace,
		);
		expect(imported.exitCode).toBe(0);
		chapter(
			"90-greetings.mdx",
			"Приветствие",
			"Каждый сигнал нуждается в одном владельце.\n\nΚάθε ειδοποίηση χρειάζεται έναν υπεύθυνο.",
		);

		const build = run(["run", "build"], appDir);
		if (build.exitCode !== 0) console.error(build.output);
		expect(build.exitCode).toBe(0);

		const pdf = new Uint8Array(readFileSync(dist("exports", "book.pdf")));
		expect(await inspectPdf(pdf)).toEqual([]);
		// A line's runs (Helvetica for the period, Noto Sans for the words), joined.
		const text = (await extractPdfText(pdf)).flatMap((runs) => {
			const lines = new Map<number, string>();
			for (const run of runs) {
				lines.set(run.y, (lines.get(run.y) ?? "") + run.text);
			}
			return [...lines.values()];
		});
		expect(text).toContain("Приветствие");
		expect(text).toContain("Каждый сигнал нуждается в одном владельце.");
		expect(text).toContain("Κάθε ειδοποίηση χρειάζεται έναν υπεύθυνο.");
		// The handoff board, from Markdown and from an <img> tag: one image.
		expect(await imageCount(pdf)).toBe(1);

		const epub = new Uint8Array(readFileSync(dist("exports", "book.epub")));
		expect(await inspectEpub(epub)).toEqual([]);
		const zip = await JSZip.loadAsync(epub);
		expect(zip.file("OEBPS/images/handoff-board.png")).not.toBeNull();
		expect(
			await zip
				.file("OEBPS/text/chapter-why-handoffs-fail.xhtml")
				?.async("string"),
		).toContain(
			'<img src="../images/handoff-board.png" alt="The handoff board in the ops room"/>',
		);

		const check = checkBuild();
		if (check.exitCode !== 0) console.error(check.output);
		expect(check.exitCode).toBe(0);
	}, 240_000);

	it("stop at Chinese text the PDF has no font for, and build without the PDF once it is off", () => {
		chapter("91-chinese.mdx", "Chinese", "每个警报都需要一个负责人。");

		const refused = run(["run", "build"], appDir);
		expect(refused.exitCode).not.toBe(0);
		expect(refused.output).toContain(
			'chapter "Chinese" (91-chinese): 每 (U+6BCF)',
		);
		expect(refused.output).toContain("set exports.pdf to false");

		const config = join(appDir, "src", "book.config.ts");
		writeFileSync(
			config,
			readFileSync(config, "utf8").replace(
				'status: "draft",',
				'status: "draft",\n\texports: { pdf: false },',
			),
		);
		const build = run(["run", "build"], appDir);
		if (build.exitCode !== 0) console.error(build.output);
		expect(build.exitCode).toBe(0);

		expect(existsSync(dist("exports", "book.pdf"))).toBe(false);
		expect(
			readdirSync(dist("exports", "chapters")).filter((file) =>
				file.endsWith(".pdf"),
			),
		).toEqual([]);
		expect(existsSync(dist("exports", "book.epub"))).toBe(true);
		const downloads = readFileSync(dist("downloads", "index.html"), "utf8");
		expect(downloads).not.toContain(".pdf");
		expect(downloads).toContain("as EPUB, which reflows");

		const check = checkBuild();
		if (check.exitCode !== 0) console.error(check.output);
		expect(check.exitCode).toBe(0);
	}, 240_000);
});
