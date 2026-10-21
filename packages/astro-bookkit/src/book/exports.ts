import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	type BookExportHelperOptions,
	createBookExportHelpers,
	createFileImageLoader,
	type ExportFormat,
	type ExportRenderOptions,
	type PdfFontFile,
} from "../exports";
import { bookRoot } from "../utils/book-data";

/** `exports` in book.config.ts: the PDF and EPUB downloads. */
export type BookExportsConfig = {
	/**
	 * `false` builds no PDF of the book or its chapters, for a book in a
	 * script the PDF has no font for; the EPUB is still built, and the
	 * downloads page lists it alone. Default `true`.
	 */
	pdf?: boolean;
	/**
	 * A TrueType or OpenType font file the PDF uses for characters its
	 * built-in fonts (Latin, Greek, Cyrillic) do not have, such as Chinese,
	 * Japanese, or Korean. Relative to the book's folder (apps/<book>/).
	 */
	pdfFont?: string;
};

type BookExportConfig = {
	title: string;
	slug?: string;
	status?: string;
	author?: { name: string };
	site?: { url?: string };
	localization?: { defaultLocale?: string };
	mechanisms?: ReadonlyArray<{ slug: string }>;
	exports?: BookExportsConfig;
};

/** The release an export describes: the book's latest release note. */
export type BookExportRelease = {
	version?: string;
	date?: string;
};

export type BookExportHelpersFromConfigOptions = Omit<
	BookExportHelperOptions,
	"book" | "formats" | "render"
> & {
	bookConfig: BookExportConfig;
	release?: BookExportRelease;
	/**
	 * The book's folder and its public folder. Default: what the bookkit()
	 * integration passes from Astro's config, else the working directory.
	 */
	folders?: { root: string; publicDir: string };
	/** Default: each distinct warning once, on the console. */
	onWarning?: (message: string) => void;
};

/**
 * SOURCE_DATE_EPOCH (reproducible-builds.org) dates the export of a book
 * that has no dated release yet; the build time never does.
 */
const sourceDateEpoch = (): string | undefined => {
	const raw = globalThis.process?.env?.SOURCE_DATE_EPOCH?.trim();
	if (!raw || !/^\d+$/.test(raw)) return undefined;
	return new Date(Number(raw) * 1000).toISOString();
};

const buildFolders = () => {
	const root = bookRoot();
	return {
		root,
		// Set by the bookkit() integration; a plain `bun test` has none.
		publicDir:
			(typeof import.meta.env === "object" &&
				import.meta.env.BOOKKIT_PUBLIC_DIR) ||
			join(root, "public"),
	};
};

// The book and every chapter download warn about the same image; say it once.
const shown = new Set<string>();
const warnOnce = (message: string) => {
	if (shown.has(message)) return;
	shown.add(message);
	console.warn(`[bookkit] ${message}`);
};

const readPdfFont = (path: string, root: string): PdfFontFile[] => {
	const file = resolve(root, path);
	if (!existsSync(file) || !statSync(file).isFile()) {
		throw new Error(
			`exports.pdfFont in book.config.ts is "${path}", but there is no file at ${file}. Give the font's path relative to the book's folder (${root}), or remove exports.pdfFont.`,
		);
	}
	return [{ name: `exports.pdfFont (${path})`, bytes: readFileSync(file) }];
};

export const createBookExportHelpersFromConfig = (
	options: BookExportHelpersFromConfigOptions,
) => {
	const { bookConfig, release, modules, basePath } = options;
	const folders = options.folders ?? buildFolders();
	const settings = bookConfig.exports ?? {};
	const formats: ExportFormat[] =
		settings.pdf === false ? ["epub"] : ["pdf", "epub"];
	const pdfFont = settings.pdfFont?.trim();
	// Read on first use, once for the book and all its chapter downloads.
	let pdfFontFiles: PdfFontFile[] | undefined;
	const render: ExportRenderOptions = {
		// Content modules are keyed relative to src/lib/ (see bookModuleSource in integration.ts).
		loadImage: createFileImageLoader({
			publicDir: folders.publicDir,
			sourceBase: join(folders.root, "src", "lib"),
		}),
		pdfFonts: pdfFont
			? () => {
					pdfFontFiles ??= readPdfFont(pdfFont, folders.root);
					return pdfFontFiles;
				}
			: undefined,
		onWarning: options.onWarning ?? warnOnce,
	};
	return createBookExportHelpers({
		book: {
			title: bookConfig.title,
			slug: bookConfig.slug,
			author: bookConfig.author?.name,
			siteUrl: bookConfig.site?.url,
			language: bookConfig.localization?.defaultLocale,
			version: release?.version || undefined,
			updatedAt: release?.date || sourceDateEpoch(),
			draft: bookConfig.status === "draft",
			mechanismOrder: bookConfig.mechanisms?.map((mechanism) => mechanism.slug),
		},
		modules,
		basePath,
		formats,
		render,
	});
};
