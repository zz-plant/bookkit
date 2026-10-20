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

	it("refuses drafts of every kind under release rules, counting a missing status as draft", () => {
		const chapter = '---\nslug: c\ntitle: "C"\n---\n';
		const result = checkContentItem("chapter", chapter, { releaseMode: true });
		expect(result.ok).toBe(false);
		expect(result.findings[0]).toMatchObject({
			code: "DRAFT_IN_RELEASE",
			field: "status",
		});
		expect(result.findings[0]?.message).toContain("no status means draft");
		expect(
			checkContentItem(
				"chapter",
				'---\nslug: c\ntitle: "C"\nstatus: in-review\n---\n',
				{ releaseMode: true },
			).ok,
		).toBe(true);
	});

	it("makes an invalid slug an error and never suggests it as a reference", () => {
		const mechanism = checkContentItem(
			"mechanism",
			'---\nslug: Promise_Drift\nstatus: published\ntitle: "P"\ndefinition: "d"\nis: ["a"]\nisNot: ["b"]\npredictions: ["c"]\ntests: ["e"]\n---\n',
		);
		expect(mechanism.ok).toBe(false);
		expect(mechanism.findings).toHaveLength(1);
		expect(mechanism.findings[0]).toMatchObject({
			level: "error",
			code: "SLUG_INVALID",
			field: "slug",
		});
		expect(mechanism.findings[0]?.fix).toContain("slug: promise-drift");

		const tool = checkContentItem(
			"tool",
			'---\nslug: a\nmechanism: promise-drifting\nname: "A"\n---\n',
			{ mechanismSlugs: new Set(["Promise_Drift", "promise-drift-gap"]) },
		);
		const fix = tool.findings.find((f) => f.code === "UNKNOWN_MECHANISM")?.fix;
		expect(fix).toContain("promise-drift-gap");
		expect(fix).not.toContain("Promise_Drift");
	});
});

describe("runbook tools", () => {
	const runbookTool = (extra: string, status = "published") =>
		`---\nslug: rollback\nstatus: ${status}\nmechanism: promise-drift\nname: "Roll back"\ntrigger: "t"\ntimeboxMinutes: 5\nsteps: ["s"]\nfailureLooksLike: ["f"]\nlegitimateDemand: ["l"]\n${extra}---\n`;

	it("errors when escalation lost its nesting, as fix:frontmatter left on-call's tools", () => {
		const result = checkContentItem(
			"tool",
			runbookTool(
				'to: "Incident commander"\nwhen: "No rollback in 15 minutes"\nwithinHours: 1\naction: "Page the owner"\n',
			),
			{ mechanismSlugs: known, frame: "runbook" },
		);
		expect(result.ok).toBe(false);
		const codes = result.findings.map((f) => `${f.code}:${f.field}`);
		expect(codes).toEqual(
			expect.arrayContaining([
				"FIELD_MISPLACED:to",
				"FIELD_MISPLACED:when",
				"FIELD_MISPLACED:withinHours",
				"FIELD_MISPLACED:action",
				"FIELD_MISSING:escalation",
				"FIELD_MISSING:runbookSteps",
			]),
		);
		expect(result.findings.find((f) => f.field === "to")?.fix).toContain(
			"escalation:",
		);
	});

	it("passes nested escalation and runbookSteps, and only warns while the tool is a draft", () => {
		const nested =
			'escalation:\n  to: "Incident commander"\n  when: "No rollback in 15 minutes"\nrunbookSteps:\n  - action: "Roll back the last deploy"\n';
		expect(
			checkContentItem("tool", runbookTool(nested), {
				mechanismSlugs: known,
				frame: "runbook",
			}).findings,
		).toEqual([]);
		const draft = checkContentItem("tool", runbookTool("", "draft"), {
			mechanismSlugs: known,
			frame: "runbook",
		});
		expect(draft.ok).toBe(true);
		expect(draft.findings.map((f) => `${f.level}:${f.field}`)).toEqual([
			"warning:escalation",
			"warning:runbookSteps",
		]);
		// Other frames do not need them.
		expect(
			checkContentItem("tool", runbookTool(""), { mechanismSlugs: known })
				.findings,
		).toEqual([]);
	});
});

describe("references to other records", () => {
	const slugs = {
		chapter: new Set(["overview", "rollback-first"]),
		mechanism: new Set(["promise-drift"]),
		tool: new Set(["date-check"]),
		glossary: new Set(["repair-clock"]),
		example: new Set(["housing-repair"]),
	};
	const chapter = (status: string, extra: string, body = "") =>
		`---\nslug: drills\ntitle: "Drills"\nstatus: ${status}\n${extra}---\n${body}`;

	it("errors on an unknown prerequisite in a published chapter, and warns in a draft", () => {
		const published = checkContentItem(
			"chapter",
			chapter(
				"published",
				"prerequisites:\n  - no-such-chapter\n  - overview\n",
			),
			{ slugs },
		);
		expect(published.ok).toBe(false);
		expect(published.findings).toEqual([
			expect.objectContaining({
				level: "error",
				code: "UNKNOWN_PREREQUISITE",
				field: "prerequisites",
			}),
		]);
		expect(published.findings[0]?.fix).toContain("overview");

		const draft = checkContentItem(
			"chapter",
			chapter("draft", "prerequisites:\n  - no-such-chapter\n"),
			{ slugs },
		);
		expect(draft.ok).toBe(true);
		expect(draft.findings[0]).toMatchObject({
			level: "warning",
			code: "UNKNOWN_PREREQUISITE",
		});
	});

	it("checks /read/ links in the body against every section, with the line", () => {
		const body = [
			"See [rollback](/read/chapters/rollback-first#steps) and [drift](/read/mechanisms/promise-drift/).",
			"",
			"Broken: [gone](/read/chapters/no-such-chapter), [tool](/read/toolkit/missing-tool),",
			'<a href="/read/glossary/missing-term">term</a> and [ex](/es/read/examples/nope).',
			"",
			"```",
			"[in code](/read/chapters/ignored)",
			"```",
			"Elsewhere: [site](/about) and [web](https://example.com/read/chapters/x).",
		].join("\n");
		const result = checkContentItem("chapter", chapter("published", "", body), {
			slugs,
		});
		const links = result.findings.filter((f) => f.code === "BROKEN_LINK");
		expect(links.map((f) => f.message)).toEqual([
			'Chapter links to /read/chapters/no-such-chapter on line 8, but no chapter has the slug "no-such-chapter"',
			'Chapter links to /read/toolkit/missing-tool on line 8, but no tool has the slug "missing-tool"',
			'Chapter links to /read/glossary/missing-term on line 9, but no glossary entry has the slug "missing-term"',
			'Chapter links to /es/read/examples/nope on line 9, but no example has the slug "nope"',
		]);
		expect(links.every((f) => f.level === "error")).toBe(true);
		expect(
			checkContentItem("chapter", chapter("draft", "", body), { slugs })
				.findings.filter((f) => f.code === "BROKEN_LINK")
				.every((f) => f.level === "warning"),
		).toBe(true);
	});
});

describe("unsafe links", () => {
	const chapter = (status: string, body: string) =>
		`---\nslug: drills\ntitle: "Drills"\nstatus: ${status}\n---\n${body}`;
	const body = [
		"Run [the script](javascript:alert(1)) or [read](https://example.com).",
		"",
		'Open <a href="&#106;avascript:alert(2)">the box</a> or <a href={target}>this</a>.',
		"`[code](javascript:x)` stays code.",
	].join("\n");
	const unsafe = (status: string) =>
		checkContentItem("chapter", chapter(status, body)).findings.filter(
			(finding) => finding.code === "UNSAFE_LINK",
		);

	it("names each link the site would show only as words, with its line in the file", () => {
		expect(unsafe("published").map((finding) => finding.message)).toEqual([
			'Chapter links to "javascript:alert(1)" on line 6, which the site shows only as words: a book links only to http, https, mailto, tel, and ftp addresses and to its own pages',
			'Chapter links to "javascript:alert(2)" on line 8, which the site shows only as words: a book links only to http, https, mailto, tel, and ftp addresses and to its own pages',
			"Chapter has a link on line 8 whose address is an expression (href={target}), which the build cannot check, so the site shows only its words",
		]);
	});

	it("is an error in a published record, or a book in release, and a warning in a draft", () => {
		expect(unsafe("published").map((finding) => finding.level)).toEqual([
			"error",
			"error",
			"error",
		]);
		expect(unsafe("draft").map((finding) => finding.level)).toEqual([
			"warning",
			"warning",
			"warning",
		]);
		expect(
			checkContentItem("chapter", chapter("draft", body), {
				releaseMode: true,
			}).findings.some(
				(finding) =>
					finding.code === "UNSAFE_LINK" && finding.level === "error",
			),
		).toBe(true);
	});

	const SAFE = "https://example.com/embed";
	const EMBEDS = [
		["iframe", "src", "<iframe src=%s></iframe>"],
		["embed", "src", "<embed src=%s />"],
		["object", "data", "<object data=%s>Fallback</object>"],
		["form", "action", "<form action=%s>Fields</form>"],
		["button", "formaction", "<button formAction=%s>Send</button>"],
	] as const;

	for (const [element, attribute, template] of EMBEDS) {
		it(`names <${element} ${attribute}> with an unsafe or computed address, and what the site does with it`, () => {
			const findings = checkContentItem(
				"chapter",
				chapter(
					"published",
					[
						template.replace("%s", '"javascript:alert(1)"'),
						"",
						template.replace("%s", "{target}"),
						"",
						template.replace("%s", `"${SAFE}"`),
					].join("\n"),
				),
			).findings.filter((finding) => finding.code === "UNSAFE_LINK");
			expect(findings).toEqual([
				{
					level: "error",
					code: "UNSAFE_LINK",
					message: `Chapter has <${element} ${attribute}="javascript:alert(1)"> on line 6, which the site leaves out, keeping only what the <${element}> contains: a book links only to http, https, mailto, tel, and ftp addresses and to its own pages`,
					fix: `Point ${attribute} at a web address or a page of the book, or remove the <${element}>.`,
				},
				{
					level: "error",
					code: "UNSAFE_LINK",
					message: `Chapter has <${element} ${attribute}={target}> on line 8, an address the build cannot check, so the site leaves out the <${element}> and keeps only what it contains`,
					fix: `Write the address as a plain string, as in ${attribute}="https://example.com".`,
				},
			]);
		});
	}
});

describe("attributes the build cannot check", () => {
	const findings = (status: string, body: string) =>
		checkContentItem(
			"chapter",
			`---\nslug: drills\ntitle: "Drills"\nstatus: ${status}\n---\n${body}`,
		).findings.filter((finding) => finding.code === "UNSAFE_LINK");
	const BODY = [
		'<iframe srcdoc="<script>alert(1)</script>"></iframe>',
		"",
		'<iframe {...{ src: "javascript:alert(2)" }}></iframe> <a {...props}>words</a>',
		"",
		'<svg><a xlink:href="javascript:alert(3)"><text>svg</text></a></svg>',
		"",
		'<svg><a href="https://example.com/"><animate attributeName="href" values="javascript:alert(4)" /><set attributeName={name} /></a></svg>',
		"",
		`<iframe srcdoc="${"<p>long</p>".repeat(8)}"></iframe> <Figure {...props} />`,
	].join("\n");

	it("names a srcdoc, a spread, an SVG link, and an animation of an address, with the line and the fix", () => {
		expect(
			findings("published", BODY).map(({ level, message, fix }) => ({
				level,
				message,
				fix,
			})),
		).toEqual([
			{
				level: "error",
				message:
					'Chapter has <iframe srcdoc="<script>alert(1)</script>"> on line 6, a document written into the page that would run with the page\'s own rights, so the site leaves out the <iframe> and keeps only what it contains',
				fix: "Point src at a web address or a page of the book in place of srcdoc, or remove the <iframe>.",
			},
			{
				level: "error",
				message:
					'Chapter has <iframe {...{ src: "javascript:alert(2)" }}> on line 8, a spread whose attributes the build cannot check, so the site leaves out the <iframe> and keeps only what it contains',
				fix: 'Write each attribute out with a plain string value, as in href="https://example.com".',
			},
			{
				level: "error",
				message:
					"Chapter has <a {...props}> on line 8, a spread whose attributes the build cannot check, so the site leaves out the <a> and keeps only what it contains",
				fix: 'Write each attribute out with a plain string value, as in href="https://example.com".',
			},
			{
				level: "error",
				message:
					'Chapter has <a xlink:href="javascript:alert(3)"> on line 10, which the site leaves out, keeping only what the <a> contains: a book links only to http, https, mailto, tel, and ftp addresses and to its own pages',
				fix: "Point xlink:href at a web address or a page of the book, or remove the <a>.",
			},
			{
				level: "error",
				message:
					'Chapter has <animate attributeName="href"> on line 12, which changes an address after the page loads, past the check of the link itself, so the site leaves out the <animate> and keeps only what it contains',
				fix: "Animate an attribute other than href, or remove the <animate>.",
			},
			{
				level: "error",
				message:
					"Chapter has <set attributeName={name}> on line 12, which may change an address the build cannot check, so the site leaves out the <set> and keeps only what it contains",
				fix: 'Write the attribute name as a plain string, as in attributeName="opacity".',
			},
			{
				level: "error",
				message: `Chapter has <iframe srcdoc="${"<p>long</p>".repeat(8).slice(0, 59)}…"> on line 14, a document written into the page that would run with the page's own rights, so the site leaves out the <iframe> and keeps only what it contains`,
				fix: "Point src at a web address or a page of the book in place of srcdoc, or remove the <iframe>.",
			},
		]);
	});

	it("is a warning in a draft, as an unsafe link is", () => {
		expect(
			new Set(findings("draft", BODY).map((finding) => finding.level)),
		).toEqual(new Set(["warning"]));
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
