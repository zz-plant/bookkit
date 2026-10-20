import { existsSync, readdirSync, statSync } from "node:fs";
import { join, normalize } from "node:path";

/**
 * The parts of `check:a11y` that need no browser: which pages of a built book
 * it checks, how its server maps a URL to a file in `dist/`, and how axe's
 * results become a report. `scripts/check-a11y.ts` drives the browser.
 */

/** One kind of page every book builds from the shared templates. */
export type PageType = {
	label: string;
	/** A fixed path, or a folder whose first entry (by name) stands in for its kind. */
	path?: string;
	firstUnder?: string;
};

/**
 * Every page type the read UI has, so a change to any shared template is
 * checked. Detail pages use the first entry by name, which keeps the set the
 * same from run to run.
 */
export const PAGE_TYPES: readonly PageType[] = [
	{ label: "home", path: "/" },
	{ label: "read hub", path: "/read/" },
	{ label: "overview", path: "/read/overview/" },
	{ label: "chapters", path: "/read/chapters/" },
	{ label: "chapter", firstUnder: "/read/chapters/" },
	{ label: "mechanisms", path: "/read/mechanisms/" },
	{ label: "mechanism", firstUnder: "/read/mechanisms/" },
	{ label: "toolkit", path: "/read/toolkit/" },
	{ label: "tool", firstUnder: "/read/toolkit/" },
	{ label: "examples", path: "/read/examples/" },
	{ label: "example", firstUnder: "/read/examples/" },
	{ label: "glossary", path: "/read/glossary/" },
	{ label: "glossary term", firstUnder: "/read/glossary/" },
	{ label: "downloads", path: "/downloads/" },
	{ label: "release notes", path: "/release-notes/" },
	{ label: "versions", path: "/versions/" },
	{ label: "author tools", path: "/read/tools/" },
	{ label: "analytics", path: "/read/analytics/" },
	{ label: "new book", path: "/new-book/" },
	{ label: "not found", path: "/404.html" },
];

export type Variant = {
	label: string;
	colorScheme: "light" | "dark";
	viewport: { width: number; height: number };
	/** A touch phone: `(hover: none)` matches and the phone action bar shows. */
	mobile: boolean;
};

export const VARIANTS: readonly Variant[] = [
	{
		label: "light, desktop",
		colorScheme: "light",
		viewport: { width: 1280, height: 800 },
		mobile: false,
	},
	{
		label: "dark, desktop",
		colorScheme: "dark",
		viewport: { width: 1280, height: 800 },
		mobile: false,
	},
	{
		label: "light, phone",
		colorScheme: "light",
		viewport: { width: 375, height: 812 },
		mobile: true,
	},
	{
		label: "dark, phone",
		colorScheme: "dark",
		viewport: { width: 375, height: 812 },
		mobile: true,
	},
];

/** WCAG 2.0, 2.1 and 2.2 at levels A and AA, plus axe's best practices. */
export const AXE_TAGS = [
	"wcag2a",
	"wcag2aa",
	"wcag21a",
	"wcag21aa",
	"wcag22aa",
	"best-practice",
];

/** Impacts that fail the check; the others are reported as warnings. */
export const FAILING_IMPACTS = ["serious", "critical"];

/** The file a static host serves for `pathname`, or undefined (a 404). */
export const resolveDistFile = (
	distDir: string,
	pathname: string,
): string | undefined => {
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return undefined;
	}
	// Normalized from the root, ".." cannot climb out of distDir.
	const base = join(distDir, normalize(`/${decoded}`));
	for (const candidate of [
		base,
		join(base, "index.html"),
		`${base.replace(/[/\\]+$/, "")}.html`,
	]) {
		if (existsSync(candidate) && statSync(candidate).isFile()) {
			return candidate;
		}
	}
	return undefined;
};

/** The pages of `distDir` to check, and the page types it has no page for. */
export const selectPages = (
	distDir: string,
	types: readonly PageType[] = PAGE_TYPES,
): { pages: { label: string; path: string }[]; missing: string[] } => {
	const pages: { label: string; path: string }[] = [];
	const missing: string[] = [];
	for (const type of types) {
		let path = type.path;
		if (type.firstUnder) {
			const dir = join(distDir, type.firstUnder);
			const first = existsSync(dir)
				? readdirSync(dir, { withFileTypes: true })
						.filter(
							(entry) =>
								entry.isDirectory() &&
								existsSync(join(dir, entry.name, "index.html")),
						)
						.map((entry) => entry.name)
						.sort()[0]
				: undefined;
			path = first ? `${type.firstUnder}${first}/` : undefined;
		}
		if (path && resolveDistFile(distDir, path)) {
			pages.push({ label: type.label, path });
		} else {
			missing.push(type.label);
		}
	}
	return { pages, missing };
};

/** The parts of an axe result this check reads. */
export type AxeNode = {
	target: unknown[];
	failureSummary?: string;
	any?: { id: string; data?: unknown }[];
};
export type AxeViolation = {
	id: string;
	impact?: string | null;
	help: string;
	helpUrl: string;
	nodes: AxeNode[];
};

/** One violation on one page in one variant. */
export type Finding = {
	book: string;
	page: string;
	variant: string;
	violation: AxeViolation;
};

export const isFailing = (violation: AxeViolation) =>
	FAILING_IMPACTS.includes(violation.impact ?? "");

const describeNode = (node: AxeNode): string => {
	const target = node.target.map(String).join(" ");
	const contrast = node.any?.find((check) => check.id === "color-contrast")
		?.data as
		| {
				fgColor?: string;
				bgColor?: string;
				contrastRatio?: number;
				expectedContrastRatio?: string;
		  }
		| undefined;
	if (contrast?.contrastRatio) {
		return `${target}: ${contrast.contrastRatio}:1 (${contrast.fgColor} on ${contrast.bgColor}), needs ${contrast.expectedContrastRatio}`;
	}
	return target;
};

const MAX_ELEMENTS = 10;
const MAX_PLACES = 4;

/**
 * Findings grouped by rule, then by element, each with where it was seen, so
 * the same element on every page prints once instead of once per page.
 */
export const formatFindings = (findings: readonly Finding[]): string[] => {
	const rules = new Map<
		string,
		{ violation: AxeViolation; nodes: Map<string, Set<string>> }
	>();
	for (const finding of findings) {
		const rule = rules.get(finding.violation.id) ?? {
			violation: finding.violation,
			nodes: new Map(),
		};
		rules.set(finding.violation.id, rule);
		for (const node of finding.violation.nodes) {
			const key = describeNode(node);
			const where = rule.nodes.get(key) ?? new Set<string>();
			where.add(`${finding.book} ${finding.page} (${finding.variant})`);
			rule.nodes.set(key, where);
		}
	}
	const lines: string[] = [];
	for (const [id, { violation, nodes }] of [...rules].sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		lines.push(`${id} (${violation.impact ?? "no impact"}): ${violation.help}`);
		lines.push(`  ${violation.helpUrl}`);
		const sorted = [...nodes].sort(([a], [b]) => a.localeCompare(b));
		for (const [node, where] of sorted.slice(0, MAX_ELEMENTS)) {
			const seen = [...where].sort();
			lines.push(`  ${node}`);
			for (const place of seen.slice(0, MAX_PLACES)) lines.push(`    ${place}`);
			if (seen.length > MAX_PLACES) {
				lines.push(`    and ${seen.length - MAX_PLACES} more`);
			}
		}
		if (sorted.length > MAX_ELEMENTS) {
			lines.push(`  and ${sorted.length - MAX_ELEMENTS} more elements`);
		}
	}
	return lines;
};
