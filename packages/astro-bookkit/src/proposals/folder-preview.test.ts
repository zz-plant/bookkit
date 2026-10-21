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
			"Ownership",
			"Trigger",
			"Steps",
			"Escalation",
			"Verification",
		]),
	},
	{
		path: "db/failover.md",
		source: runbook("Fail over the database", ["Ownership", "Steps"]),
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
			titles: 0,
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

	it("with releaseMode, holds every draft record to a published book's rules, not only examples", () => {
		const files = [
			{ path: "mechanisms/promise-drift.mdx", source: mechanism },
			{
				path: "chapters/05-when-the-date-moves.mdx",
				source: contentContract("chapter").template.replace(
					"status: draft\n",
					"",
				),
			},
		];
		const drafts = (preview: ReturnType<typeof previewFolder>) =>
			preview.documents.flatMap((doc) =>
				doc.findings
					.filter((finding) => finding.code === "DRAFT_IN_RELEASE")
					.map(() => doc.section),
			);

		expect(drafts(previewFolder(files))).toEqual([]);
		expect(drafts(previewFolder(files, { releaseMode: true })).sort()).toEqual([
			"chapter",
			"mechanism",
		]);
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

describe("previewFolder frame sections", () => {
	const covered = (source: string) =>
		previewFolder([{ path: "drain.md", source }], { frame: "runbook" })
			.documents[0].frameSteps.covered;

	it("counts a heading whose whole text is the section's name, as a book's overview does", () => {
		expect(
			covered(
				"# Drain a node\n\n## Ownership\n\nPlatform.\n\n### trigger\n\nDiskPressure.\n\n## **Steps**\n\n1. Cordon it.\n\nEscalation\n----------\n\nPage the lead.\n",
			),
		).toEqual(["ownership", "trigger", "steps", "escalation"]);
	});

	it("does not count a word that starts like the section, a heading that says more, or a field line", () => {
		expect(
			covered(
				"# Drain a node\n\n**Owner:** Platform\nTrigger: DiskPressure for 15 minutes\n\n## Owner\n\n## Steps to drain\n\n## Verify\n\n```md\n## Escalation\n```\n",
			),
		).toEqual([]);
	});
});

describe("previewFolder with a frame that does not exist", () => {
	it("names the nearest frame", () => {
		expect(() =>
			previewFolder([{ path: "a.md", source: "# A\n" }], { frame: "runbok" }),
		).toThrow(
			'Unknown frame "runbok". Did you mean runbook? Use one of: intervention, explainer, field-guide, runbook.',
		);
	});
});
