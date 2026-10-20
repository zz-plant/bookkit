import { describe, expect, it } from "bun:test";

import {
	extractPdfExportEnabled,
	extractPreviewAccessEnabled,
	extractSiteConfig,
} from "./site-config";

const site = `{ url: "https://example.book", indexable: false }`;

describe("extractSiteConfig", () => {
	it("reads an inline site object under `as const`, as every book app writes it", () => {
		expect(
			extractSiteConfig(
				`export const bookConfig = { slug: "x", site: ${site} } as const;`,
			),
		).toEqual({ url: "https://example.book", indexable: false });
	});

	it("follows a shorthand `{ site }` to its binding", () => {
		expect(
			extractSiteConfig(
				`const site = ${site};\nexport const bookConfig = { site };`,
			),
		).toEqual({ url: "https://example.book", indexable: false });
	});

	it("follows `site: shared` and spreads, later keys winning", () => {
		expect(
			extractSiteConfig(
				`const shared = ${site} satisfies object;
export const bookConfig = { site: { ...shared, indexable: true } } as const;`,
			),
		).toEqual({ url: "https://example.book", indexable: true });
	});

	it("leaves non-literal values unset", () => {
		expect(
			extractSiteConfig(
				`const isProduction = process.env.NODE_ENV === "production";
export const bookConfig = { site: { url: "https://example.book", indexable: isProduction } };`,
			),
		).toEqual({ url: "https://example.book" });
	});

	it("returns null when there is no site config to read", () => {
		expect(extractSiteConfig(`export const bookConfig = { slug: "x" };`)).toBe(
			null,
		);
		expect(extractSiteConfig(`export const other = { site: ${site} };`)).toBe(
			null,
		);
	});
});

describe("extractPreviewAccessEnabled", () => {
	it("is true only for a literal enabled: true", () => {
		const config = (previewAccess: string) =>
			`export const bookConfig = { slug: "x", previewAccess: ${previewAccess} } as const;`;
		expect(
			extractPreviewAccessEnabled(
				config('{ enabled: true, tokens: [{ token: "t" }] }'),
			),
		).toBe(true);
		expect(
			extractPreviewAccessEnabled(config("{ enabled: false, tokens: [] }")),
		).toBe(false);
		expect(extractPreviewAccessEnabled(config("{ tokens: [] }"))).toBe(false);
		expect(
			extractPreviewAccessEnabled(
				`const preview = { enabled: true };\nexport const bookConfig = { previewAccess: preview };`,
			),
		).toBe(true);
		expect(
			extractPreviewAccessEnabled(`export const bookConfig = { slug: "x" };`),
		).toBe(false);
	});

	it("reads site.runtime alongside url and indexable", () => {
		expect(
			extractSiteConfig(
				`export const bookConfig = { site: { url: "https://x.book", runtime: "server" } };`,
			),
		).toEqual({ url: "https://x.book", runtime: "server" });
	});
});

describe("extractPdfExportEnabled", () => {
	it("is false only when exports.pdf is the literal false", () => {
		const config = (exports: string) =>
			`export const bookConfig = { slug: "x", exports: ${exports} } as const;`;
		expect(extractPdfExportEnabled(config("{ pdf: false }"))).toBe(false);
		expect(extractPdfExportEnabled(config("{ pdf: true }"))).toBe(true);
		expect(extractPdfExportEnabled(config('{ pdfFont: "fonts/a.otf" }'))).toBe(
			true,
		);
		expect(
			extractPdfExportEnabled(
				`const downloads = { pdf: false };\nexport const bookConfig = { exports: downloads };`,
			),
		).toBe(false);
		expect(
			extractPdfExportEnabled(`export const bookConfig = { slug: "x" };`),
		).toBe(true);
	});
});
