import { describe, expect, it } from "bun:test";

import {
	CONTENT_SECTIONS,
	checkContentItem,
	contentContract,
	mechanismSlugsFrom,
	retiredSlugsFromCorpus,
	scaffoldSource,
} from "./content-check";

const known = new Set(["promise-drift", "delay-as-force"]);

describe("contentContract", () => {
	it("gives every section a template that compiles with no findings", () => {
		for (const section of CONTENT_SECTIONS) {
			const contract = contentContract(section);
			const result = checkContentItem(section, contract.template, {
				mechanismSlugs: known,
			});
			expect({ section, findings: result.findings }).toEqual({
				section,
				findings: [],
			});
		}
	});

	it("exports the build's schema as JSON Schema", () => {
		const schema = contentContract("mechanism").jsonSchema as {
			required?: string[];
		};
		expect(schema.required).toContain("definition");
		expect(contentContract("tool").directory).toBe("toolkit");
	});
});

describe("checkContentItem", () => {
	it("names each missing field with what to write", () => {
		const result = checkContentItem(
			"tool",
			'---\nslug: date-check\nmechanism: promise-drift\nname: "Date check"\n---\n',
			{ mechanismSlugs: known },
		);
		expect(result.ok).toBe(true);
		expect(result.findings.map((finding) => finding.message)).toEqual([
			"Tool missing trigger",
			"Tool missing timeboxMinutes",
			"Tool missing steps list",
			"Tool missing failureLooksLike list",
			"Tool missing legitimateDemand list",
		]);
		const trigger = result.findings[0];
		expect(trigger.code).toBe("FIELD_MISSING");
		expect(trigger.field).toBe("trigger");
		expect(trigger.fix).toContain("Add `trigger:`");
	});

	it("treats empty placeholders as missing, once per field", () => {
		const result = checkContentItem(
			"mechanism",
			'---\nslug: promise-drift\ntitle: "Promise drift"\ndefinition: "x"\nis:\n  - ""\nisNot:\n  - "y"\npredictions:\n  - "z"\ntests:\n  - "w"\n---\n',
		);
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]).toMatchObject({
			code: "FIELD_MISSING",
			field: "is",
			message: "Mechanism missing is list",
		});
	});

	it("reports invalid YAML instead of calling the frontmatter missing", () => {
		const result = checkContentItem(
			"tool",
			"---\nslug: a\nmechanism: promise-drift\nname: Bad: colon\n---\n",
		);
		expect(result.ok).toBe(false);
		expect(result.findings[0].code).toBe("FRONTMATTER_INVALID");
		expect(result.findings[0].message).toContain("line");
		expect(
			checkContentItem("chapter", "# No frontmatter").findings[0],
		).toMatchObject({
			code: "FRONTMATTER_MISSING",
			message: "Chapter missing frontmatter",
		});
	});

	it("errors on unknown mechanism references and suggests the closest slugs", () => {
		const tool = checkContentItem(
			"tool",
			'---\nslug: a\nmechanism: promise-drifting\nname: "A"\n---\n',
			{ mechanismSlugs: known },
		);
		const finding = tool.findings.find(
			(item) => item.code === "UNKNOWN_MECHANISM",
		);
		expect(tool.ok).toBe(false);
		expect(finding?.message).toBe(
			'Tool references unknown mechanism "promise-drifting"',
		);
		expect(finding?.fix).toContain("promise-drift");

		const chapter = checkContentItem(
			"chapter",
			'---\nslug: c\ntitle: "C"\nmechanisms:\n  - delay-as-force\n  - coercion-by-design\n---\n',
			{ mechanismSlugs: known },
		);
		expect(
			chapter.findings.filter((item) => item.code === "UNKNOWN_MECHANISM"),
		).toHaveLength(1);
	});

	it("keeps the timebox ceiling an error and flags drafts in release mode", () => {
		const tool = checkContentItem(
			"tool",
			'---\nslug: a\nmechanism: promise-drift\nname: "A"\ntimeboxMinutes: 30\n---\n',
		);
		expect(tool.ok).toBe(false);
		expect(tool.findings.find((item) => item.level === "error")).toMatchObject({
			code: "TIMEBOX_TOO_LONG",
			message:
				"Action primitive timebox error: Action primitives must be executable in <= 10 minutes",
		});

		const example =
			'---\nmechanism: promise-drift\ndomain: Housing\ntitle: "T"\nstatus: draft\n---\n';
		expect(checkContentItem("example", example).ok).toBe(true);
		expect(
			checkContentItem("example", example, { releaseMode: true }).findings[0]
				?.code,
		).toBe("DRAFT_IN_RELEASE");
	});
});

describe("retired slugs", () => {
	it("points a reference to a merged-away slug at its replacement", () => {
		const retiredSlugs = retiredSlugsFromCorpus({
			merged: [
				{
					into: "promise-drift",
					date: "2026-10-08",
					before: [{ slug: "promise-drift" }, { slug: "date-slip" }],
				},
				{ into: 3, before: "bad" },
			],
		});
		expect([...retiredSlugs.keys()]).toEqual(["date-slip"]);
		const result = checkContentItem(
			"example",
			'---\nmechanism: date-slip\ndomain: Housing\ntitle: "T"\n---\n',
			{ mechanismSlugs: known, retiredSlugs },
		);
		expect(result.findings[0]?.fix).toBe(
			"date-slip was merged into promise-drift on 2026-10-08; use promise-drift.",
		);
	});

	it("does not suggest slugs that share only short words", () => {
		const result = checkContentItem(
			"tool",
			'---\nslug: a\nmechanism: power-by-design\nname: "A"\n---\n',
			{ mechanismSlugs: new Set(["delay-as-force", "power-of-attorney-gap"]) },
		);
		const fix = result.findings.find(
			(f) => f.code === "UNKNOWN_MECHANISM",
		)?.fix;
		expect(fix).toContain("closest: power-of-attorney-gap");
		expect(fix).not.toContain("delay-as-force");
	});
});

describe("scaffoldSource", () => {
	it("starts every section with no errors, only warnings for what to write", () => {
		const required: Record<string, Record<string, string>> = {
			mechanism: { slug: "new-idea", title: "New idea: with a colon" },
			tool: {
				slug: "new-tool",
				mechanism: "promise-drift",
				name: 'A "quoted" name',
			},
			example: { mechanism: "promise-drift" },
			chapter: { slug: "01-start", title: "Start" },
			glossary: {},
		};
		for (const section of CONTENT_SECTIONS) {
			const source = scaffoldSource(
				section,
				required[section],
				"Notes */ here.",
			);
			const result = checkContentItem(section, source, {
				mechanismSlugs: known,
			});
			expect({ section, ok: result.ok }).toEqual({ section, ok: true });
			expect(source).toContain("{/* Notes * / here. */}");
		}
	});
});

describe("MDX bodies", () => {
	it("rejects HTML comments outside code, which break the build", () => {
		const source = (body: string) =>
			`---\nslug: c\ntitle: "C"\n---\n\n${body}\n`;
		const result = checkContentItem("chapter", source("<!-- note -->"));
		expect(result.ok).toBe(false);
		expect(result.findings[0]).toMatchObject({ code: "MDX_HTML_COMMENT" });
		expect(
			checkContentItem("chapter", source("{/* note */} and `<!-- -->` in code"))
				.findings,
		).toEqual([]);
		expect(
			checkContentItem("chapter", source("<!-- fine in .md -->"), {
				format: "md",
			}).findings,
		).toEqual([]);
	});
});

describe("mechanismSlugsFrom", () => {
	it("collects declared slugs and skips unparseable files", () => {
		expect([
			...mechanismSlugsFrom([
				"---\nslug: a\n---\n",
				"no frontmatter",
				"---\nslug: b\n---\n",
			]),
		]).toEqual(["a", "b"]);
	});
});
