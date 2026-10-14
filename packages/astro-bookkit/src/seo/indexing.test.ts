import { describe, expect, it } from "bun:test";
import { createBookRobotsTxt, createBookSitemapEntries } from "./book";
import { buildSeoProps, resolveBookSite } from "./config";

const site = { url: "https://example.book", indexable: true };

describe("resolveBookSite", () => {
	it("keeps every unreleased book out of search, whatever site.indexable says", () => {
		for (const status of [undefined, "draft", "in-review"]) {
			expect(resolveBookSite({ status, site }).indexable).toBe(false);
		}
		for (const status of ["published", "stable"]) {
			expect(resolveBookSite({ status, site }).indexable).toBe(true);
			expect(
				resolveBookSite({ status, site: { ...site, indexable: false } })
					.indexable,
			).toBe(false);
		}
	});

	it("marks pages noindex, closes robots.txt, and empties the sitemap of a draft", () => {
		const draft = resolveBookSite({ status: "draft", site });
		expect(buildSeoProps({ site: draft }).robots).toBe("noindex, nofollow");
		const robots = createBookRobotsTxt({ site: draft });
		expect(robots).toContain("Disallow: /\n");
		expect(robots).not.toContain("Sitemap:");
		expect(createBookSitemapEntries({ site: draft })).toEqual([]);

		const published = resolveBookSite({ status: "published", site });
		expect(buildSeoProps({ site: published }).robots).toBeUndefined();
		expect(createBookRobotsTxt({ site: published })).toContain(
			"Sitemap: https://example.book/sitemap.xml",
		);
		expect(
			createBookSitemapEntries({ site: published }).length,
		).toBeGreaterThan(0);
	});
});
