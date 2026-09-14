import { describe, expect, test } from "bun:test";
import type { MechanismRecord } from "./mechanism-overlap";
import {
	auditReleaseControlDrift,
	auditReviewCadence,
	auditRunbookCoverage,
	deriveComplianceMatrix,
	deriveReviewCadence,
	type ReleaseRecord,
	summarizeCompliance,
	type ToolRecord,
} from "./runbook-coverage";

const mechanism = (
	slug: string,
	overrides: Partial<MechanismRecord> = {},
): MechanismRecord => ({
	slug,
	title: slug,
	definition: `definition of ${slug}`,
	is: ["a"],
	isNot: ["not a"],
	predictions: ["p"],
	tests: ["t"],
	...overrides,
});

const tools: ToolRecord[] = [
	{
		slug: "classify-sev",
		mechanism: "incident-triage",
		owner: "platform-oncall",
		drills: ["drill: classify a pager alert"],
		satisfies: ["inc-triage-01"],
		escalation: { to: "duty-manager", when: "severity=1", withinHours: 1 },
		file: "toolkit/classify-sev.mdx",
	},
	{
		slug: "rollback",
		mechanism: "rollback-first",
		drills: [],
		file: "toolkit/rollback.mdx",
	},
];

describe("auditRunbookCoverage", () => {
	test("is a no-op unless the book frame is runbook", () => {
		const result = auditRunbookCoverage({
			book: "x",
			frame: "intervention",
			mechanisms: [mechanism("incident-triage", { satisfies: ["c-1"] })],
			tools,
		});
		expect(result).toEqual([]);
	});

	test("warns when a mechanism has no operationalizing tool", () => {
		const result = auditRunbookCoverage({
			book: "x",
			frame: "runbook",
			mechanisms: [mechanism("orphan-control", { satisfies: ["c-9"] })],
			tools: [],
		});
		expect(result).toHaveLength(1);
		expect(result[0].category).toBe("runbook-coverage");
		expect(result[0].severity).toBe("warning");
		expect(result[0].evidence).toMatchObject({ mechanism: "orphan-control" });
	});

	test("flags missing satisfies, drills, owner, and escalation on tools", () => {
		const mechanisms = [
			mechanism("incident-triage", { satisfies: ["inc-triage-01"] }),
			mechanism("rollback-first"),
		];
		const result = auditRunbookCoverage({
			book: "x",
			frame: "runbook",
			mechanisms,
			tools,
		});
		const toolSlugs = result
			.filter((s) => s.file)
			.map((s) => s.evidence.tool)
			.filter(Boolean);
		expect(toolSlugs).toContain("rollback");
		expect(
			result.some(
				(s) => s.file?.includes("rollback") && s.message.includes("no drills"),
			),
		).toBe(true);
		expect(
			result.some(
				(s) =>
					s.file?.includes("rollback") &&
					s.message.includes("no declared owner"),
			),
		).toBe(true);
		expect(
			result.some(
				(s) =>
					s.file?.includes("rollback") && s.message.includes("no escalation"),
			),
		).toBe(true);
	});

	test("does not flag a fully-covered tool", () => {
		const result = auditRunbookCoverage({
			book: "x",
			frame: "runbook",
			mechanisms: [
				mechanism("incident-triage", { satisfies: ["inc-triage-01"] }),
			],
			tools: [tools[0]],
		});
		expect(result.some((s) => s.evidence.tool === "classify-sev")).toBe(false);
	});
});

describe("deriveComplianceMatrix", () => {
	test("maps controls -> mechanism -> tools and drill-readiness", () => {
		const mechanisms = [
			mechanism("incident-triage", {
				satisfies: ["inc-triage-01", "inc-triage-02"],
			}),
			mechanism("rollback-first", { satisfies: ["rel-rollback-01"] }),
		];
		const rows = deriveComplianceMatrix(mechanisms, tools);

		expect(rows).toHaveLength(3);
		const incidentRows = rows.filter((r) => r.mechanism === "incident-triage");
		expect(incidentRows.every((r) => r.tools.includes("classify-sev"))).toBe(
			true,
		);
		expect(incidentRows.every((r) => r.drillReady)).toBe(true);
		const rollbackRow = rows.find((r) => r.control === "rel-rollback-01");
		expect(rollbackRow?.tools).toEqual(["rollback"]);
		expect(rollbackRow?.drillReady).toBe(false);
	});

	test("marks a control uncovered when the mechanism has no tools", () => {
		const rows = deriveComplianceMatrix(
			[mechanism("orphan", { satisfies: ["control-1"] })],
			[],
		);
		expect(rows[0].tools).toEqual([]);
		const summary = summarizeCompliance(rows);
		expect(summary.covered).toBe(0);
		expect(summary.uncoveredControls).toContain("control-1");
	});
});

describe("auditReleaseControlDrift", () => {
	const releases: ReleaseRecord[] = [
		{
			version: "0.2.0",
			date: "2026-03-01",
			changedSections: ["toolkit", "mechanisms"],
		},
		{
			version: "0.1.0",
			date: "2026-02-10",
			changedSections: ["overview"],
		},
	];

	test("flags an undrilled control when a toolkit release exists", () => {
		const rows = deriveComplianceMatrix(
			[mechanism("rollback-first", { satisfies: ["rel-rollback-01"] })],
			[tools[1]],
		);
		const result = auditReleaseControlDrift(rows, releases, "on-call");
		expect(result.some((s) => s.severity === "warning")).toBe(true);
		expect(
			result.some((s) =>
				s.message.includes('control "rel-rollback-01" remains undrilled'),
			),
		).toBe(true);
	});

	test("emits an info note when every control is drilled", () => {
		const rows = deriveComplianceMatrix(
			[mechanism("incident-triage", { satisfies: ["inc-triage-01"] })],
			[tools[0]],
		);
		const result = auditReleaseControlDrift(rows, releases, "on-call");
		expect(result).toHaveLength(1);
		expect(result[0].severity).toBe("info");
	});

	test("is a no-op when no release touches runbook sections", () => {
		const rows = deriveComplianceMatrix(
			[mechanism("rollback-first", { satisfies: ["rel-rollback-01"] })],
			[tools[1]],
		);
		const result = auditReleaseControlDrift(
			rows,
			[{ version: "0.1.0", date: "2026-02-10", changedSections: ["overview"] }],
			"on-call",
		);
		expect(result).toEqual([]);
	});
});

describe("deriveReviewCadence", () => {
	const cadenceTools: ToolRecord[] = [
		{
			slug: "weekly-proc",
			mechanism: "incident-triage",
			reviewEveryDays: 7,
			file: "toolkit/weekly-proc.mdx",
		},
		{
			slug: "biweekly-proc",
			mechanism: "incident-triage",
			reviewEveryDays: 14,
			file: "toolkit/biweekly-proc.mdx",
		},
		{
			slug: "no-cadence",
			mechanism: "incident-triage",
			file: "toolkit/no-cadence.mdx",
		},
	];

	test("computes due date as latest release plus cadence", () => {
		const result = deriveReviewCadence(
			cadenceTools,
			[{ version: "0.1.0", date: "2026-09-01" }],
			"2026-09-14",
		);
		expect(result).toHaveLength(2);
		const weekly = result.find((c) => c.tool === "weekly-proc");
		expect(weekly?.nextReviewDue).toBe("2026-09-08");
		expect(weekly?.overdue).toBe(true);
		const biweekly = result.find((c) => c.tool === "biweekly-proc");
		expect(biweekly?.nextReviewDue).toBe("2026-09-15");
		expect(biweekly?.overdue).toBe(false);
	});

	test("is a no-op when no release has a parseable date", () => {
		const result = deriveReviewCadence(cadenceTools, [
			{ version: "0.1.0", date: "" },
		]);
		expect(result).toEqual([]);
	});
});

describe("auditReviewCadence", () => {
	const auditTools: ToolRecord[] = [
		{
			slug: "weekly-proc",
			mechanism: "incident-triage",
			reviewEveryDays: 7,
			file: "toolkit/weekly-proc.mdx",
		},
	];

	test("emits one warning per overdue procedure", () => {
		const result = auditReviewCadence(
			"on-call",
			auditTools,
			[{ version: "0.1.0", date: "2026-09-01" }],
			"2026-09-14",
		);
		expect(result).toHaveLength(1);
		expect(result[0].category).toBe("runbook-coverage");
		expect(result[0].severity).toBe("warning");
		expect(result[0].message).toContain("7-day review cadence");
		expect(result[0].evidence.nextReviewDue).toBe("2026-09-08");
	});
});

describe("deriveComplianceMatrix with releases", () => {
	test("annotates rows with the earliest due date and overdue flag", () => {
		const rows = deriveComplianceMatrix(
			[mechanism("incident-triage", { satisfies: ["c-1"] })],
			[
				{
					slug: "proc-a",
					mechanism: "incident-triage",
					reviewEveryDays: 7,
					drills: ["drill a"],
				},
				{
					slug: "proc-b",
					mechanism: "incident-triage",
					reviewEveryDays: 14,
					drills: ["drill b"],
				},
			],
			{
				releases: [{ version: "0.1.0", date: "2026-09-01" }],
				asOf: "2026-09-14",
			},
		);
		expect(rows[0].nextReviewDue).toBe("2026-09-08");
		expect(rows[0].reviewOverdue).toBe(true);
	});

	test("leaves rows unannotated when no releases are passed", () => {
		const rows = deriveComplianceMatrix(
			[mechanism("incident-triage", { satisfies: ["c-1"] })],
			[
				{
					slug: "proc-a",
					mechanism: "incident-triage",
					reviewEveryDays: 7,
					drills: ["drill a"],
				},
			],
		);
		expect(rows[0].nextReviewDue).toBeUndefined();
		expect(rows[0].reviewOverdue).toBeUndefined();
	});
});
