import { describe, expect, it } from "bun:test";
import type { BookVersionEntry } from "../releases/versions";
import {
	type BookLayoutConfig,
	createBookLayoutRenderState,
	createBookLayoutState,
} from "./layout";

describe("book layout state", () => {
	it("normalizes wrapper state for preview, archived versions, canonical paths, and translation notices", () => {
		// Locale and version paths are rewritten per request, so they need a server.
		const bookConfig: BookLayoutConfig = {
			site: { url: "https://docs.example.com", runtime: "server" },
			title: "Bad People",
			slug: "bad-people",
			localization: {
				defaultLocale: "en",
				locales: [
					{ code: "en", label: "English", isDefault: true },
					{ code: "fr", label: "Français" },
				],
				label: "Language",
			},
		};
		const versionEntries: BookVersionEntry[] = [
			{ version: "1.2.0" },
			{ version: "2.0.0", isLatest: true },
		];

		const state = createBookLayoutState({
			astro: {
				props: {
					title: "Compliance traps",
					hasMermaid: true,
					description: "How to spot moral technology drift.",
				},
				locals: {
					originalUrl:
						"https://docs.example.com/v/1.2.0/fr/read/chapters/compliance-traps",
					preview: {
						isPreview: true,
						status: "active",
						label: "Staff preview",
						tokenHint: "abc123",
						expiresAt: "2026-04-01T00:00:00.000Z",
					},
				},
				url: new URL("https://docs.example.com/read/chapters/compliance-traps"),
			},
			bookConfig,
			versionEntries,
			localizedContentModules: [
				{
					"../content/book/chapters/intro.md": {
						frontmatter: { slug: "intro" },
					},
					"../content/book/chapters/compliance-traps.md": {
						frontmatter: { slug: "compliance-traps" },
					},
					"../content/book/chapters/intro.fr.md": {
						frontmatter: { slug: "intro", locale: "fr" },
					},
				},
			],
			versionPrefix: "v",
		});

		expect(state.resolvedVersion).toBe("1.2.0");
		expect(state.seoProps.canonicalPath).toBe(
			"/fr/read/chapters/compliance-traps",
		);
		expect(state.seoProps.canonicalUrl).toBe(
			"https://docs.example.com/fr/read/chapters/compliance-traps",
		);
		expect(state.seoProps.robots).toBe("noindex, nofollow");

		expect(state.renderState.locale.activeLocale).toBe("fr");
		expect(state.renderState.hasMermaid).toBe(true);
		expect(state.renderState.translationNotice).toMatchObject({
			show: true,
			activeLocaleLabel: "Français",
			defaultLocaleLabel: "English",
			percentage: 50,
		});
		expect(state.renderState.version).toMatchObject({
			resolvedVersion: "1.2.0",
			currentVersionIsLatest: false,
			badgeLabel: "v1.2.0",
			showVersionHint: true,
		});
		expect(state.renderState.preview).toMatchObject({
			isPreview: true,
			label: "Staff preview",
			tokenHint: "abc123",
		});
		expect(state.renderState.preview.details).toContain(
			"Link ending in abc123",
		);
		expect(
			state.renderState.preview.details.some((entry) =>
				entry.startsWith("Expires "),
			),
		).toBe(true);
		expect(state.renderState.head.resolvedRobots).toBe("noindex, nofollow");
		expect(state.renderState.head.resolvedCanonical).toBe(
			"https://docs.example.com/fr/read/chapters/compliance-traps",
		);
	});

	it("keeps a static build to pages that exist and drops the trailing slash", () => {
		const state = createBookLayoutState({
			astro: {
				props: { title: "Compliance traps" },
				url: new URL(
					"https://docs.example.com/read/chapters/compliance-traps/",
				),
			},
			bookConfig: {
				site: { url: "https://docs.example.com" },
				title: "Bad People: How Harm Is Normalized",
				features: { aiQa: true },
				localization: {
					defaultLocale: "en",
					locales: [
						{ code: "en", label: "English", isDefault: true },
						{ code: "es", label: "Español" },
					],
				},
			},
			versionEntries: [
				{ version: "1.0.0" },
				{ version: "2.0.0", isLatest: true },
			],
			localizedContentModules: [],
		});

		expect(state.hasServerRuntime).toBe(false);
		expect(state.aiQaEnabled).toBe(false);
		expect(state.seoProps.canonicalUrl).toBe(
			"https://docs.example.com/read/chapters/compliance-traps",
		);
		expect(state.renderState.locale.entries.map((entry) => entry.code)).toEqual(
			["en"],
		);
		expect(state.renderState.head.hreflangEntries).toEqual([]);
		expect(state.renderState.head.hreflangDefault).toBeNull();
		expect(state.renderState.version.hasVersions).toBe(false);
		expect(state.renderState.ogType).toBe("article");
		expect(state.renderState.head.resolvedOgSiteName).toBe("Bad People");
	});

	it("extracts locale, route, and archive metadata decisions into render state", () => {
		const renderState = createBookLayoutRenderState({
			title: "Version archive",
			bookTitle: "Bad People",
			bookVersion: "2.0.0",
			seoProps: {
				siteUrl: "https://docs.example.com",
				canonicalUrl: "https://docs.example.com/en/versions",
			},
			requestPathname: "/en/versions/",
			versionEntries: [{ version: "2.0.0", isLatest: true }],
			versionArchivePath: "/versions",
			locales: [
				{ code: "en", label: "English", isDefault: true, completeness: 1 },
				{ code: "fr", label: "Français", completeness: 0.25 },
			],
			defaultLocale: "en",
			includeDefaultLocalePrefix: true,
			localeLabel: "Language",
			isPreview: false,
		});

		expect(renderState.lang).toBe("en");
		expect(renderState.hasMermaid).toBe(false);
		expect(renderState.locale).toMatchObject({
			activeLocale: "en",
			defaultLocale: "en",
			includeDefaultLocalePrefix: true,
		});
		expect(renderState.routes).toMatchObject({
			requestPathname: "/en/versions/",
			normalizedPath: "/en/versions",
			normalizedLocalePath: "/versions",
			pathWithoutLocale: "/versions",
			isArchivePage: true,
			isReadRoute: false,
			isDownloadsRoute: false,
			isReadDetailRoute: false,
		});
		expect(renderState.translationNotice.show).toBe(false);
		expect(renderState.version).toMatchObject({
			resolvedVersion: "2.0.0",
			currentVersionIsLatest: true,
			badgeLabel: "Latest",
			showVersionHint: false,
		});
		expect(renderState.head.resolvedRobots).toBe("noindex, nofollow");
		expect(renderState.head.resolvedCanonical).toBe(
			"https://docs.example.com/en/versions",
		);
	});

	it("carries the byline and the generated preview's size into page metadata", () => {
		const state = createBookLayoutState({
			astro: {
				props: {
					title: "Refusability Gap",
					ogImage: "/og/read/mechanisms/refusability-gap.png",
				},
				url: new URL(
					"https://crumple-zone.book/read/mechanisms/refusability-gap",
				),
			},
			bookConfig: {
				site: { url: "https://crumple-zone.book" },
				title: "The Crumple Zone",
				author: { name: "Kanav Jain" },
			},
			versionEntries: [],
			localizedContentModules: [],
		});
		const { head } = state.renderState;

		expect(head.author).toBe("Kanav Jain");
		expect(head.ogImageSize).toEqual({ width: 1200, height: 630 });
		expect(head.resolvedOgImageAlt).toBe(head.resolvedOgTitle);
		const page = head.structuredDataScripts[0] as {
			author?: { name: string };
			isPartOf?: { author?: { name: string } };
		};
		expect(page.author?.name).toBe("Kanav Jain");
		expect(page.isPartOf?.author?.name).toBe("Kanav Jain");
	});
});
