import { describe, expect, it } from "bun:test";

import { contentContract } from "../validators/content-check";
import { previewFolder } from "./folder-preview";

const runbook = (title: string, sections: string[]) =>
	[
		`# ${title}`,
		"",
		"Restart the queue worker when the incident alert fires and the on-call owner agrees.",
		...sections.flatMap((section) => [
			"",
			`## ${section}`,
			"",
			"Escalate to the incident lead after a drill or rollback.",
		]),
	].join("\n");

// A folder as a team keeps it: plain Markdown, no frontmatter.
const RUNBOOKS = [
	{
		path: "queue/restart.md",
		source: runbook("Restart the queue", [
			"Owner",
			"Trigger",
			"Steps",
			"Escalation",
			"Verify",
		]),
	},
	{
		path: "db/failover.md",
		source: runbook("Fail over the database", ["Owner", "Steps"]),
	},
];

describe("previewFolder on plain runbooks", () => {
	it("detects the runbook frame and counts coverage per document", () => {
		const preview = previewFolder(RUNBOOKS);
		expect(preview.frame).toMatchObject({
			slug: "runbook",
			source: "detected",
			stepsPer: "document",
		});
		const coverage = Object.fromEntries(
			preview.frame.steps.map((step) => [step.id, step.documents]),
		);
		expect(coverage).toEqual({
			ownership: 2,
			trigger: 1,
			steps: 2,
			escalation: 1,
			verification: 1,
		});
		expect(preview.sections.chapter).toBe(2);
		expect(preview.documents.every((doc) => !doc.contract)).toBe(true);
	});

	it("reports gaps without failing until a frame is required", () => {
		expect(previewFolder(RUNBOOKS).errors).toBe(0);
		const gated = previewFolder(RUNBOOKS, {
			frame: "runbook",
			requireFrameSteps: true,
		});
		expect(gated.errors).toBe(1);
		const failover = gated.documents.find(
			(doc) => doc.path === "db/failover.md",
		);
		expect(failover?.frameSteps.missing).toEqual([
			"trigger",
			"escalation",
			"verification",
		]);
		expect(failover?.findings[0]).toMatchObject({
			level: "error",
			code: "FRAME_STEP_MISSING",
		});
		expect(failover?.title).toBe("Fail over the database");
	});

	it("says what import would change for MDX", () => {
		const [doc] = previewFolder([
			{
				path: "notes.md",
				source: "# Notes\n\nPage <lead> about {service}.\n<!-- todo -->\n",
			},
		]).documents;
		expect(doc.mdx).toEqual({
			htmlComments: 1,
			braces: 2,
			autolinks: 0,
			tags: 1,
			html: 0,
			esm: 0,
		});
	});
});

describe("previewFolder on contract content", () => {
	const mechanism = contentContract("mechanism").template;
	const tool = contentContract("tool").template;

	it("checks files in section folders against the contract", () => {
		const preview = previewFolder([
			{ path: "mechanisms/promise-drift.mdx", source: mechanism },
			{
				path: "toolkit/date-check.mdx",
				source: tool
					.replace("mechanism: promise-drift", "mechanism: promise-drfit")
					.replace("timeboxMinutes: 10", "timeboxMinutes: 45"),
			},
		]);
		expect(preview.sections).toMatchObject({ mechanism: 1, tool: 1 });
		const codes = preview.documents
			.flatMap((doc) => doc.findings)
			.map((finding) => finding.code)
			.sort();
		expect(codes).toEqual(["TIMEBOX_TOO_LONG", "UNKNOWN_MECHANISM"]);
		expect(preview.errors).toBe(2);
	});

	it("recognizes a mechanism by its frontmatter outside a section folder", () => {
		const [doc] = previewFolder([
			{ path: "drift.mdx", source: mechanism },
		]).documents;
		expect(doc).toMatchObject({ section: "mechanism", contract: true });
		expect(doc.findings).toEqual([]);
	});
});

describe("previewFolder frames", () => {
	it("checks a book-shaped frame across the folder, not per document", () => {
		const essays = [
			{ path: "a.md", source: "# One\n\n## Recognition\n\nText." },
			{ path: "b.md", source: "# Two\n\n## Mechanism\n\nText." },
		];
		const preview = previewFolder(essays, {
			frame: "intervention",
			requireFrameSteps: true,
		});
		expect(preview.frame.stepsPer).toBe("folder");
		expect(preview.frame.missing).toEqual(["exoneration", "agency"]);
		expect(preview.findings).toHaveLength(1);
		expect(preview.documents.every((doc) => doc.findings.length === 0)).toBe(
			true,
		);
	});

	it("names the frames it knows when given an unknown one", () => {
		expect(() => previewFolder(RUNBOOKS, { frame: "playbook" })).toThrow(
			/Use one of: intervention, explainer, field-guide, runbook/,
		);
	});
});

describe("previewFolder on book content", () => {
	it("frames a book as a whole, not each chapter", () => {
		const preview = previewFolder(
			[
				{
					path: "chapters/00-overview.mdx",
					source:
						'---\nslug: overview\ntitle: "Overview"\nstatus: draft\n---\n\n## Ownership\n\n## Trigger\n\n## Steps\n\n## Escalation\n\n## Verification\n',
				},
				{
					path: "chapters/10-triage.mdx",
					source:
						'---\nslug: triage\ntitle: "Triage"\nstatus: draft\n---\n\nTriage the incident alert before you escalate.\n',
				},
			],
			{ frame: "runbook", requireFrameSteps: true },
		);
		expect(preview.frame.stepsPer).toBe("folder");
		expect(preview.errors).toBe(0);
	});
});

describe("previewFolder section labels", () => {
	it("counts field lines like **Owner:** as sections", () => {
		const [doc] = previewFolder(
			[
				{
					path: "drain.md",
					source:
						"# Drain a node\n\n**Owner:** Platform\nTrigger: DiskPressure for 15 minutes\n\n## Steps\n\n1. Cordon it.\n",
				},
			],
			{ frame: "runbook" },
		).documents;
		expect(doc.frameSteps.covered).toEqual(["ownership", "trigger", "steps"]);
	});
});
