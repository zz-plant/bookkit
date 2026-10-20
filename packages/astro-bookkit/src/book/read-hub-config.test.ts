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
});
