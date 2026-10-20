import { describe, expect, it } from "bun:test";

import { defaultReadHubConfig, resolveReadHubConfig } from "./read-hub-config";

describe("reading hub copy", () => {
	it("uses the default hub when book.config.ts sets no readHub", () => {
		expect(resolveReadHubConfig(undefined)).toEqual(defaultReadHubConfig);
		expect(resolveReadHubConfig({})).toEqual(defaultReadHubConfig);
	});

	it("takes the lede and cards the config sets, and keeps the rest of the hub", () => {
		const card = {
			title: "Classify an alert",
			description: "The first ten minutes of a page.",
			href: "/read/toolkit/classify-alert-severity",
			funnelStep: "new_reader_toolkit",
		};
		const hub = resolveReadHubConfig({
			lede: "Start with the overview.",
			quickStartCards: [card],
		});
		expect(hub.hero).toEqual({
			...defaultReadHubConfig.hero,
			lede: "Start with the overview.",
		});
		expect(hub.quickStartCards).toEqual([card]);
		expect(hub.buckets).toEqual(defaultReadHubConfig.buckets);
		expect(hub.utilities).toEqual(defaultReadHubConfig.utilities);
	});

	it("shows no cards for an empty list, and the default cards when only the lede is set", () => {
		expect(
			resolveReadHubConfig({ quickStartCards: [] }).quickStartCards,
		).toEqual([]);
		expect(resolveReadHubConfig({ lede: "x" }).quickStartCards).toEqual(
			defaultReadHubConfig.quickStartCards,
		);
	});

	it("ends the default cards with chapter 1, after About this book and the chapter list", () => {
		const hub = resolveReadHubConfig(undefined, {
			firstChapter: {
				title: "Own the incident",
				href: "/read/chapters/overview",
				summary: "Who owns an alert, and when.",
			},
		});
		expect(
			hub.quickStartCards?.map(({ title, href, description }) => [
				title,
				href,
				description,
			]),
		).toEqual([
			[
				"About this book",
				"/read/overview",
				"What the book sets out to do, its approach, and its ground rules.",
			],
			[
				"Read the chapters in order",
				"/read/chapters",
				"The full argument, start to finish.",
			],
			[
				"Start with chapter 1: Own the incident",
				"/read/chapters/overview",
				"Who owns an alert, and when.",
			],
		]);
		// A book with no chapters yet gets the first two.
		expect(resolveReadHubConfig({}).quickStartCards).toHaveLength(2);
	});

	it("keeps a book's own cards as they are, with no chapter card added", () => {
		const own = [
			{ title: "Classify an alert", description: "d", href: "/read/toolkit/x" },
		];
		expect(
			resolveReadHubConfig(
				{ quickStartCards: own },
				{ firstChapter: { title: "One", href: "/read/chapters/one" } },
			).quickStartCards,
		).toEqual(own);
	});
});
