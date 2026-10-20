import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	type AxeViolation,
	type Finding,
	formatFindings,
	isFailing,
	resolveDistFile,
	selectPages,
} from "./a11y";

const dist = mkdtempSync(join(tmpdir(), "bookkit-a11y-"));
afterAll(() => rmSync(dist, { recursive: true, force: true }));

const page = (path: string) => {
	const file = join(dist, path);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, "<!doctype html><title>x</title>");
};
for (const path of [
	"index.html",
	"404.html",
	"read/index.html",
	"read/chapters/index.html",
	"read/chapters/b-second/index.html",
	"read/chapters/a-first/index.html",
	"read/glossary/index.html",
]) {
	page(path);
}
// A folder without a page is not a detail page.
mkdirSync(join(dist, "read", "chapters", "0-assets"), { recursive: true });

describe("resolveDistFile", () => {
	it("serves a folder's index.html, with or without the trailing slash", () => {
		expect(resolveDistFile(dist, "/")).toBe(join(dist, "index.html"));
		expect(resolveDistFile(dist, "/read/")).toBe(
			join(dist, "read", "index.html"),
		);
		expect(resolveDistFile(dist, "/read")).toBe(
			join(dist, "read", "index.html"),
		);
		expect(resolveDistFile(dist, "/404.html")).toBe(join(dist, "404.html"));
	});

	it("finds nothing for a missing page, and nothing outside dist/", () => {
		expect(resolveDistFile(dist, "/read/toolkit/")).toBeUndefined();
		expect(resolveDistFile(dist, "/%E0%A4%A")).toBeUndefined();
		expect(resolveDistFile(dist, "/read/../../../index.html")).toBe(
			join(dist, "index.html"),
		);
	});
});

describe("selectPages", () => {
	it("checks the first detail page by name and lists the types the book has no page for", () => {
		const { pages, missing } = selectPages(dist, [
			{ label: "home", path: "/" },
			{ label: "chapter", firstUnder: "/read/chapters/" },
			{ label: "glossary term", firstUnder: "/read/glossary/" },
			{ label: "toolkit", path: "/read/toolkit/" },
		]);
		expect(pages).toEqual([
			{ label: "home", path: "/" },
			{ label: "chapter", path: "/read/chapters/a-first/" },
		]);
		expect(missing).toEqual(["glossary term", "toolkit"]);
	});
});

describe("findings", () => {
	const contrast: AxeViolation = {
		id: "color-contrast",
		impact: "serious",
		help: "Elements must meet minimum color contrast ratio thresholds",
		helpUrl: "https://example.test/color-contrast",
		nodes: [
			{
				target: [".breadcrumb span"],
				any: [
					{
						id: "color-contrast",
						data: {
							fgColor: "#a09d97",
							bgColor: "#f7f4ed",
							contrastRatio: 2.46,
							expectedContrastRatio: "4.5:1",
						},
					},
				],
			},
		],
	};
	const region: AxeViolation = {
		id: "region",
		impact: "moderate",
		help: "All page content should be contained by landmarks",
		helpUrl: "https://example.test/region",
		nodes: [{ target: [".mobile-cta__primary"] }],
	};

	it("fail the check only when serious or critical", () => {
		expect(isFailing(contrast)).toBe(true);
		expect(isFailing({ ...contrast, impact: "critical" })).toBe(true);
		expect(isFailing(region)).toBe(false);
		expect(isFailing({ ...region, impact: null })).toBe(false);
	});

	it("print each element once, with its contrast and every place it was seen", () => {
		const findings: Finding[] = ["/read/", "/"].flatMap((path) =>
			["light, desktop", "light, phone"].map((variant) => ({
				book: "on-call",
				page: path,
				variant,
				violation: contrast,
			})),
		);
		expect(formatFindings(findings)).toEqual([
			"color-contrast (serious): Elements must meet minimum color contrast ratio thresholds",
			"  https://example.test/color-contrast",
			"  .breadcrumb span: 2.46:1 (#a09d97 on #f7f4ed), needs 4.5:1",
			"    on-call / (light, desktop)",
			"    on-call / (light, phone)",
			"    on-call /read/ (light, desktop)",
			"    on-call /read/ (light, phone)",
		]);
	});

	it("say how many more places there are past the first four", () => {
		const findings: Finding[] = ["/a/", "/b/", "/c/", "/d/", "/e/", "/f/"].map(
			(path) => ({
				book: "on-call",
				page: path,
				variant: "dark, phone",
				violation: region,
			}),
		);
		const lines = formatFindings(findings);
		expect(lines.at(-1)).toBe("    and 2 more");
		expect(lines).toContain("  .mobile-cta__primary");
	});

	it("say how many more elements there are past the first ten", () => {
		const letters = "ABCDEFGHIJKL".split("");
		const lines = formatFindings([
			{
				book: "on-call",
				page: "/read/glossary/",
				variant: "light, desktop",
				violation: {
					...region,
					nodes: letters.map((letter) => ({ target: [`#alpha-${letter}`] })),
				},
			},
		]);
		expect(lines.filter((line) => line.startsWith("  #alpha-"))).toHaveLength(
			10,
		);
		expect(lines.at(-1)).toBe("  and 2 more elements");
	});
});
