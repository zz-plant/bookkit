import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import type { InlineImage } from "../utils/markdown-blocks";
import { describeExportEntry } from "./metadata";
import type { ExportEntry, ExportRenderOptions } from "./types";

/**
 * The images entries show, read from disk at build time: `/images/x.png`
 * from the book's public folder (where import copies a note's images), and a
 * relative path from beside the content file. Nothing is downloaded: an image
 * at a URL shows its alt text in the exports.
 */

export type ExportImageType =
	| "image/png"
	| "image/jpeg"
	| "image/gif"
	| "image/svg+xml"
	| "image/webp";

export type ExportImageFile = {
	/** The file's path; an image shown twice is stored once. */
	key: string;
	/** Its file name, such as `handoff-board.png`. */
	name: string;
	/** From the file's bytes, not its extension. */
	mediaType: ExportImageType;
	bytes: Uint8Array;
};

/** The image's file, or why the exports show its alt text instead. */
export type ExportImageResult =
	| { file: ExportImageFile }
	| { problem: string; fix: string };

export type ExportImageLoader = (
	src: string,
	entry: ExportEntry,
) => ExportImageResult;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
	signature.every((byte, index) => bytes[offset + index] === byte);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** The image format the bytes hold, or null when they are not one the exports carry. */
export const sniffImageType = (bytes: Uint8Array): ExportImageType | null => {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		return "image/png";
	}
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
	if (startsWith(bytes, ascii("GIF8"))) return "image/gif";
	if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
		return "image/webp";
	}
	const head = new TextDecoder().decode(bytes.subarray(0, 1024));
	if (
		/^﻿?\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(
			head,
		)
	) {
		return "image/svg+xml";
	}
	return null;
};

export type FileImageLoaderOptions = {
	/** The book's public folder: `/images/x.png` is read from `<publicDir>/images/x.png`. */
	publicDir: string;
	/**
	 * The folder entries' `source` paths are relative to (an app's
	 * `src/lib/`, where its `import.meta.glob` calls are). Without it, a
	 * relative image path is reported instead of read.
	 */
	sourceBase?: string;
};

const PUBLIC_FIX =
	"Put the image in the book's public/images/ folder and link it as /images/<file name>.";

const inside = (folder: string, path: string) => {
	const rel = relative(folder, path);
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

export const createFileImageLoader =
	({ publicDir, sourceBase }: FileImageLoaderOptions): ExportImageLoader =>
	(src, entry) => {
		const target = src.trim();
		if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) {
			return {
				problem:
					"is not a file in the book, and images are not downloaded at build time",
				fix: PUBLIC_FIX,
			};
		}
		let path = target.split(/[?#]/)[0];
		try {
			path = decodeURIComponent(path);
		} catch {
			// Keep the path as written.
		}
		let file: string;
		if (path.startsWith("/")) {
			file = resolve(publicDir, `.${path}`);
			if (!inside(publicDir, file)) {
				return { problem: "points outside the public folder", fix: PUBLIC_FIX };
			}
		} else if (entry.source && sourceBase) {
			const contentDir = resolve(sourceBase, dirname(entry.source));
			file = resolve(contentDir, path);
		} else {
			return {
				problem:
					"is a relative path, and the export does not know the file it is relative to",
				fix: PUBLIC_FIX,
			};
		}
		if (!existsSync(file) || !statSync(file).isFile()) {
			return {
				problem: `was not found at ${file}`,
				fix: path.startsWith("/")
					? "A path that starts with / is read from the book's public/ folder; check the file name."
					: "A relative path is read from the content file's folder; check the file name.",
			};
		}
		const bytes = readFileSync(file);
		const mediaType = sniffImageType(bytes);
		if (!mediaType) {
			return {
				problem: "is not a PNG, JPEG, GIF, SVG, or WebP image",
				fix: "Save it in one of those formats.",
			};
		}
		return { file: { key: file, name: basename(file), mediaType, bytes } };
	};

/** Reads images from `public/` in the working directory, as `astro build` runs in the book's folder. */
export const defaultImageLoader = (): ExportImageLoader =>
	createFileImageLoader({ publicDir: resolve("public") });

/** The build warning for an image an export shows as alt text. */
export const imageWarning = (options: {
	format: "PDF" | "EPUB";
	entry: ExportEntry;
	image: InlineImage;
	problem: string;
	fix: string;
}): string => {
	const { format, entry, image, problem, fix } = options;
	const shown = image.alt.trim()
		? "shows its alt text instead"
		: "leaves it out (it has no alt text)";
	return `${format} export: ${describeExportEntry(entry)}: image ${image.src} ${problem}, so the ${format} ${shown}. ${fix}`;
};

export const warnWith = (options: ExportRenderOptions) =>
	options.onWarning ?? ((message: string) => console.warn(message));
