import { describe, expect, test } from "bun:test";
import { defaultFrames } from "../frames/defaults";
import {
	extractBookStatusFromSource,
	extractFrameConfigFromSource,
	extractMechanismUrgencySlugsFromSource,
	extractSiteSettingsFromSource,
} from "./frame-config";

describe("extractFrameConfigFromSource", () => {
	test("parses slug and steps from a frame property", () => {
		const source = `
			const isProduction = true;
			export const bookConfig = {
				slug: "on-call",
				frame: {
					slug: "runbook",
					steps: ["ownership", "trigger", "steps", "escalation", "verification"],
					intent: "Move readers from alarm to bounded action.",
				},
				constraints: { mechanismCountTarget: [4, 6] },
			} as const;
			export default bookConfig;
		`;
		const result = extractFrameConfigFromSource(source);
		expect(result).toEqual({
			slug: "runbook",
			steps: ["ownership", "trigger", "steps", "escalation", "verification"],
		});
	});

	test("keeps the slug of a frame that lists no steps", () => {
		const source = `export const bookConfig = { frame: { slug: "runbook", intent: "x" } } as const;`;
		expect(extractFrameConfigFromSource(source)).toEqual({ slug: "runbook" });
	});

	test("returns null when no frame property exists", () => {
		const source = `export const bookConfig = { slug: "bad-people" } as const;`;
		expect(extractFrameConfigFromSource(source)).toBeNull();
	});

	test("ignores braces inside string literals", () => {
		const source = `
			export const bookConfig = {
				frame: {
					slug: "intervention",
					intent: "Move readers {from} {harm}.",
					steps: ["recognition"],
				},
			} as const;
		`;
		const result = extractFrameConfigFromSource(source);
		expect(result?.slug).toBe("intervention");
		expect(result?.steps).toEqual(["recognition"]);
	});

	test("supports single-quoted and template-literal values", () => {
		const source = `
			export const bookConfig = {
				frame: {
					slug: 'field-guide',
					steps: ['steps', \`checklist\`],
				},
			} as const;
		`;
		const result = extractFrameConfigFromSource(source);
		expect(result?.slug).toBe("field-guide");
		expect(result?.steps).toEqual(["steps", "checklist"]);
	});
});

describe("defaultFrames runbook", () => {
	test("runbook frame exists with the expected required steps", () => {
		const frame = defaultFrames.find((f) => f.slug === "runbook");
		expect(frame).toBeDefined();
		expect(frame?.steps.map((s) => s.id)).toEqual([
			"ownership",
			"trigger",
			"steps",
			"escalation",
			"verification",
		]);
		expect(frame?.steps.every((s) => s.required)).toBe(true);
	});
});

describe("extractBookStatusFromSource", () => {
	test("reads the book's own status, not a nested one or one in a string", () => {
		expect(
			extractBookStatusFromSource(`
				// status: "stable" in a comment is not read
				const note = "status: 'in-review'";
				export const bookConfig = {
					slug: "on-call",
					previewAccess: { tokens: [{ status: "revoked" }] },
					status: "published",
				} as const;`),
		).toBe("published");
	});

	test("is undefined when the config sets no status", () => {
		expect(
			extractBookStatusFromSource(
				`export const bookConfig = { slug: "x", site: { status: "draft" } };`,
			),
		).toBeUndefined();
	});
});

describe("extractMechanismUrgencySlugsFromSource", () => {
	test("lists each key of mechanismsIndex.urgency, quoted or bare", () => {
		const source = `export const bookConfig = {
	readHub: { lede: "No urgency: here, nor { braces }." },
	// mechanismsIndex: { urgency: { "commented-out": "urgent" } },
	mechanismsIndex: {
		lede: "Patterns, and the urgency: of each.",
		urgency: {
			"delay-as-force": "urgent",
			'compliance-trap': "high-leverage", // a comment, with "quotes": in it
			/* "skipped": "urgent", */
			drift: "stabilize",
		},
	},
};`;
		expect(extractMechanismUrgencySlugsFromSource(source)).toEqual([
			"delay-as-force",
			"compliance-trap",
			"drift",
		]);
	});

	test("is empty when the book sets no urgency", () => {
		expect(
			extractMechanismUrgencySlugsFromSource("export default {};"),
		).toEqual([]);
		expect(
			extractMechanismUrgencySlugsFromSource(
				'export default { mechanismsIndex: { lede: "x" } };',
			),
		).toEqual([]);
	});
});

describe("extractSiteSettingsFromSource", () => {
	test("reads site.url and site.indexable written as literals", () => {
		const source = `export const bookConfig = {
	site: {
		// url: "https://commented.example",
		url: "https://book.example",
		defaultMeta: { url: "https://nested.example" },
		indexable: false, /* indexable: true */
	},
};`;
		expect(extractSiteSettingsFromSource(source)).toEqual({
			url: "https://book.example",
			indexable: false,
		});
	});

	test("reads a literal that a comment comes before", () => {
		const source = `export const bookConfig = {
	site: {
		url: /* the public address */ "https://book.example",
		indexable: // kept out of search for now
			false,
	},
};`;
		expect(extractSiteSettingsFromSource(source)).toEqual({
			url: "https://book.example",
			indexable: false,
		});
	});

	test("leaves out a value written as an expression", () => {
		expect(
			extractSiteSettingsFromSource(
				`export default { site: { url: \`https://\${slug}.book\`, indexable: isProduction && !forceNoindex } };`,
			),
		).toEqual({});
		expect(
			extractSiteSettingsFromSource(
				'export default { site: { url: "https://a" + path, indexable: false || preview } };',
			),
		).toEqual({});
	});

	test("is null when the config has no site object", () => {
		expect(extractSiteSettingsFromSource("export default {};")).toBeNull();
		expect(
			extractSiteSettingsFromSource("export default { site: sharedSite };"),
		).toBeNull();
	});
});
