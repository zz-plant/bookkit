import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ogImagePathFor } from "./og-image";
import { writeOgImages } from "./og-render";

/**
 * writeOgImages over a small built site: every generated card is written,
 * renders run side by side and still land at the right paths, and a second
 * build reads them from the cache.
 */

let root: string;
const PATHS = ["/", "/read/chapters/one", "/read/chapters/two", "/glossary"];

const page = (path: string, title: string) => `<html><head>
<meta property="og:title" content="${title}">
<meta property="og:description" content="A card for ${title}.">
<meta property="og:url" content="https://example.book${path}">
<meta property="og:site_name" content="Example">
<meta property="og:image" content="https://example.book${ogImagePathFor(path)}">
</head></html>`;

const buildSite = (name: string): string => {
	const out = join(root, name);
	for (const [index, path] of PATHS.entries()) {
		const dir = join(out, path);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "index.html"), page(path, `Page ${index + 1}`));
	}
	return out;
};

const pngs = (out: string) =>
	readdirSync(join(out, "og"), { recursive: true })
		.map(String)
		.filter((file) => file.endsWith(".png"))
		.sort();

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "bookkit-og-render-"));
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("writeOgImages", () => {
	it("renders every card, then reuses the cache on the next build", async () => {
		const cacheDir = join(root, "cache");
		const first = buildSite("first");
		expect(await writeOgImages(first, { cacheDir })).toEqual({
			written: PATHS.length,
			rendered: PATHS.length,
		});
		expect(pngs(first)).toEqual(
			PATHS.map((path) => ogImagePathFor(path).replace(/^\/og\//, "")).sort(),
		);
		for (const file of pngs(first)) {
			// PNG signature: each file is a whole image, not a partial write.
			expect(
				readFileSync(join(first, "og", file))
					.subarray(1, 4)
					.toString(),
			).toBe("PNG");
		}

		const second = buildSite("second");
		expect(await writeOgImages(second, { cacheDir })).toEqual({
			written: PATHS.length,
			rendered: 0,
		});
		for (const file of pngs(first)) {
			expect(readFileSync(join(second, "og", file))).toEqual(
				readFileSync(join(first, "og", file)),
			);
		}
	}, 30_000);

	it("gives each page its own card when the renders overlap", async () => {
		const out = buildSite("uncached");
		await writeOgImages(out, { cacheDir: null });
		const images = pngs(out).map((file) => readFileSync(join(out, "og", file)));
		expect(new Set(images.map((png) => png.toString("base64"))).size).toBe(
			PATHS.length,
		);
	}, 30_000);
});
