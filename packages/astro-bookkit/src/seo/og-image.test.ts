import { describe, expect, it } from "bun:test";

import {
	isGeneratedOgImage,
	ogCardFromHtml,
	ogImagePathFor,
	ogSectionLabel,
	ogTitleSize,
	pagePathForFile,
} from "./og-image";

const page = ({
	path,
	title,
	image = ogImagePathFor(path),
	extra = "",
}: {
	path: string;
	title: string;
	image?: string;
	extra?: string;
}) => `<html><head>
<meta property="og:title" content="${title}">
<meta property="og:description" content="Who pays when the system won&#39;t &amp; can&#39;t.">
<meta property="og:url" content="https://crumple-zone.book${path}">
<meta property="og:site_name" content="The Crumple Zone">
<meta property="og:image" content="https://crumple-zone.book${image}">
${extra}
</head></html>`;

describe("ogImagePathFor", () => {
	it("maps each page to its own PNG, home to index.png", () => {
		expect(ogImagePathFor("/")).toBe("/og/index.png");
		expect(ogImagePathFor("/read/mechanisms/refusability-gap/")).toBe(
			"/og/read/mechanisms/refusability-gap.png",
		);
		expect(ogImagePathFor("/es/read")).toBe("/og/read.png");
	});
});

describe("ogSectionLabel", () => {
	it("labels detail pages only", () => {
		expect(ogSectionLabel("/read/chapters/02-the-right-to-say-no")).toBe(
			"Chapter",
		);
		expect(ogSectionLabel("/read/toolkit/a")).toBe("Tool");
		expect(ogSectionLabel("/read/chapters")).toBeUndefined();
		expect(ogSectionLabel("/")).toBeUndefined();
	});
});

describe("ogCardFromHtml", () => {
	it("reads the page's own name, description, book, host, and byline", () => {
		const found = ogCardFromHtml(
			page({
				path: "/read/mechanisms/refusability-gap",
				title: "Refusability Gap • The Crumple Zone",
				extra: '<meta name="author" content="Kanav Jain">',
			}),
		);
		expect(found?.imagePath).toBe("/og/read/mechanisms/refusability-gap.png");
		expect(found?.card).toEqual({
			label: "Mechanism",
			title: "Refusability Gap",
			description: "Who pays when the system won't & can't.",
			book: "The Crumple Zone",
			author: "Kanav Jain",
			host: "crumple-zone.book",
		});
	});

	it("strips a full-title suffix too, and keeps the home page's full title", () => {
		expect(
			ogCardFromHtml(
				page({
					path: "/read",
					title:
						"Read • The Crumple Zone: How Systems Externalize Harm and What to Build Instead",
				}),
			)?.card.title,
		).toBe("Read");
		expect(
			ogCardFromHtml(
				page({
					path: "/",
					title:
						"The Crumple Zone: How Systems Externalize Harm and What to Build Instead",
				}),
			)?.card.title,
		).toBe(
			"The Crumple Zone: How Systems Externalize Harm and What to Build Instead",
		);
	});

	it("leaves pages that name their own image alone", () => {
		expect(
			ogCardFromHtml(
				page({ path: "/read", title: "Read", image: "/covers/read.jpg" }),
			),
		).toBeNull();
		expect(ogCardFromHtml("<html><head></head></html>")).toBeNull();
	});
});

describe("ogCardFromHtml without og:url", () => {
	it("uses the file's page path and the image's host", () => {
		const html = page({
			path: "/release-notes",
			title: "Release notes • The Crumple Zone",
		}).replace(/<meta property="og:url"[^>]*>/, "");
		expect(ogCardFromHtml(html)).toBeNull();
		const found = ogCardFromHtml(
			html,
			pagePathForFile("release-notes/index.html"),
		);
		expect(found?.imagePath).toBe("/og/release-notes.png");
		expect(found?.card.title).toBe("Release notes");
		expect(found?.card.host).toBe("crumple-zone.book");
	});

	it("maps built files to page paths", () => {
		expect(pagePathForFile("index.html")).toBe("/");
		expect(pagePathForFile("read/chapters/a/index.html")).toBe(
			"/read/chapters/a",
		);
		expect(pagePathForFile("404.html")).toBe("/404");
	});
});

describe("helpers", () => {
	it("recognizes generated images by path", () => {
		expect(isGeneratedOgImage("https://x.book/og/read.png")).toBe(true);
		expect(isGeneratedOgImage("/og/default.svg")).toBe(false);
		expect(isGeneratedOgImage(undefined)).toBe(false);
	});

	it("steps the title size down as titles grow", () => {
		expect(ogTitleSize("Refusability Gap")).toBe(76);
		expect(
			ogTitleSize(
				"Don’t Turn People Into Infrastructure: Why Institutions Run Hot — and Who They Burn",
			),
		).toBe(52);
	});
});
