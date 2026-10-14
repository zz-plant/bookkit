import { describe, expect, it } from "bun:test";

import { domainNotice, liveSitemapUrl, wranglerHosts } from "./deploy-domain";

const wrangler = (extra = "") => `{
	// Cloudflare Worker for one book
	"name": "bookkit-on-call",
	"assets": { "directory": "./dist" }${extra}
}`;

describe("wranglerHosts", () => {
	it("reads custom domains and route patterns, ignoring comments", () => {
		expect(wranglerHosts(wrangler())).toEqual([]);
		expect(
			wranglerHosts(
				wrangler(`,
	"routes": [
		{ "pattern": "oncall.example.com", "custom_domain": true },
		"example.org/books/*"
	]`),
			),
		).toEqual(["oncall.example.com", "example.org"]);
		expect(wranglerHosts("not json")).toEqual([]);
	});
});

describe("domainNotice", () => {
	it("is quiet when the Worker serves site.url's host", () => {
		expect(
			domainNotice({
				book: "on-call",
				siteUrl: "https://oncall.example.com",
				wranglerJsonc: wrangler(
					`, "routes": [{ "pattern": "oncall.example.com", "custom_domain": true }]`,
				),
			}),
		).toBeNull();
	});

	it("explains how to attach the domain when it is not served", () => {
		const notice = domainNotice({
			book: "on-call",
			siteUrl: "https://on-call.book",
			wranglerJsonc: wrangler(),
		});
		expect(notice).toContain("https://on-call.book");
		expect(notice).toContain("apps/on-call/wrangler.jsonc");
		expect(notice).toContain('"custom_domain": true');
	});
});

describe("liveSitemapUrl", () => {
	it("is site.url's sitemap when the Worker serves that host", () => {
		expect(
			liveSitemapUrl({
				siteUrl: "https://oncall.example.com/",
				wranglerJsonc: wrangler(
					`, "routes": [{ "pattern": "oncall.example.com", "custom_domain": true }]`,
				),
			}),
		).toEqual({ url: "https://oncall.example.com/sitemap.xml" });
	});

	it("says why the live site is unknown otherwise", () => {
		expect(
			liveSitemapUrl({
				siteUrl: "https://on-call.book",
				wranglerJsonc: wrangler(),
			}),
		).toEqual({
			unknown:
				"the Worker does not serve site.url's host (on-call.book), and its *.workers.dev address depends on the Cloudflare account",
		});
		expect(
			liveSitemapUrl({ siteUrl: undefined, wranglerJsonc: wrangler() }),
		).toEqual({ unknown: "site.url is not a URL" });
	});
});
