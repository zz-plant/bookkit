import { describe, expect, it } from "bun:test";
import type { MechanismRecord, ToolRecord } from "../suggestions";
import { proposeConfigDraft } from "./config-proposal";
import { buildProposalBundle, detectFrameFromBodies } from "./index";
import { mechanismFrontmatter, toolFrontmatter } from "./materialize";

const mechanism = (
	overrides: Partial<MechanismRecord> = {},
): MechanismRecord => ({
	slug: "incident-triage",
	title: "Incident Triage",
	definition: "Classify an alert's severity under a time budget.",
	is: ["severity classification"],
	isNot: ["waiting for full context"],
	predictions: [],
	tests: [],
	...overrides,
});

const tool = (overrides: Partial<ToolRecord> = {}): ToolRecord => ({
	slug: "incident-triage--classify-severity",
	mechanism: "incident-triage",
	name: "Classify Severity",
	...overrides,
});

describe("frame detection", () => {
	it("detects a runbook frame from operational chapter bodies", () => {
		const detection = detectFrameFromBodies([
			{
				file: "oncall.mdx",
				body: "When the pager alerts, classify the incident severity, escalate to the owner, roll back the risky change, and verify recovery.",
			},
			{
				file: "drill.mdx",
				body: "Every drill must show ownership and a runbook escalation path.",
			},
		]);

		expect(detection.frameSlug).toBe("runbook");
		expect(detection.confidence).toBeGreaterThan(0.5);
		expect(detection.runbookHits).toBeGreaterThan(detection.teachingHits);
	});

	it("detects an intervention frame from teaching bodies", () => {
		const detection = detectFrameFromBodies([
			{
				file: "ch1.mdx",
				body: "Readers learn a pattern, practice it, and reflect on what changed.",
			},
		]);

		expect(detection.frameSlug).toBe("intervention");
	});

	it("falls back to intervention with zero confidence on neutral text", () => {
		const detection = detectFrameFromBodies([
			{ file: "ch1.mdx", body: "A plain paragraph with no signals here." },
		]);

		expect(detection.frameSlug).toBe("intervention");
		expect(detection.confidence).toBe(0);
	});
});

describe("proposal bundle", () => {
	it("proposes a mechanism draft for a recurring unregistered concept", () => {
		const bundle = buildProposalBundle({
			book: "test",
			chapters: [
				{
					slug: "ch1",
					title: "One",
					mechanisms: [],
					prerequisites: [],
				},
			],
			chapterBodies: [
				{
					file: "ch1.mdx",
					body: "The Sticky Decision Loop keeps repeating here.",
				},
				{
					file: "ch2.mdx",
					body: "Avoiding the Sticky Decision Loop takes practice.",
				},
			],
			mechanisms: [],
			tools: [],
			glossaryTerms: [],
			causalStance: "Stuck situations resolve through bounded ownership",
		});

		expect(bundle.mechanisms.length).toBeGreaterThan(0);
		const proposal = bundle.mechanisms[0];
		expect(proposal.id).toMatch(/^mechanism:/);
		expect(proposal.title).toBe("Sticky Decision Loop");
		expect(proposal.is.length).toBeGreaterThan(0);
		expect(bundle.mechanisms.every((m) => m.evidence.occurrences >= 2)).toBe(
			true,
		);
	});

	it("does not re-propose registered vocabulary", () => {
		const bundle = buildProposalBundle({
			book: "test",
			chapters: [],
			chapterBodies: [
				{
					file: "ch1.mdx",
					body: "The Sticky Decision Loop keeps repeating here.",
				},
				{
					file: "ch2.mdx",
					body: "Avoiding the Sticky Decision Loop takes practice.",
				},
			],
			mechanisms: [],
			tools: [],
			glossaryTerms: ["Sticky Decision Loop"],
		});

		expect(
			bundle.mechanisms.some((m) => m.title === "Sticky Decision Loop"),
		).toBe(false);
	});

	it("proposes toolkit bindings for uncovered mechanisms under a runbook frame", () => {
		const bundle = buildProposalBundle({
			book: "test",
			chapters: [
				{
					slug: "overview",
					title: "Overview",
					mechanisms: ["incident-triage"],
					prerequisites: [],
				},
			],
			chapterBodies: [
				{
					file: "ch1.mdx",
					body: "Escalate to the incident owner under the runbook trigger.",
				},
			],
			mechanisms: [mechanism()],
			tools: [],
			glossaryTerms: [],
			existingFrame: "runbook",
		});

		expect(bundle.tools.length).toBeGreaterThan(0);
		expect(bundle.tools[0].mechanism).toBe("incident-triage");
		expect(bundle.tools[0].id).toMatch(/^tool:/);
	});

	it("respects an author-declared frame over detection", () => {
		const bundle = buildProposalBundle({
			book: "test",
			chapters: [],
			chapterBodies: [
				{ file: "ch1.mdx", body: "Readers learn a pattern and reflect on it." },
			],
			mechanisms: [mechanism()],
			tools: [tool()],
			glossaryTerms: [],
			existingFrame: "runbook",
		});

		expect(bundle.frame.frameSlug).toBe("runbook");
		expect(bundle.frame.confidence).toBe(1);
	});
});

describe("config draft", () => {
	it("emits a runbook config with the registry steps when the frame is runbook", () => {
		const config = proposeConfigDraft({
			book: "test",
			frame: {
				frameSlug: "runbook",
				confidence: 0.9,
				runbookHits: 9,
				teachingHits: 1,
				source: "detected",
			},
		});

		expect(config.source).toContain('slug: "runbook"');
		for (const step of [
			"ownership",
			"trigger",
			"steps",
			"escalation",
			"verification",
		]) {
			expect(config.source).toContain(`"${step}"`);
		}
		expect(config.intent).toContain("drilled");
	});

	it("emits an intervention config by default", () => {
		const config = proposeConfigDraft({
			book: "test",
			frame: {
				frameSlug: "intervention",
				confidence: 0.6,
				runbookHits: 1,
				teachingHits: 2,
				source: "detected",
			},
		});

		expect(config.source).toContain('slug: "intervention"');
		for (const step of ["recognition", "exoneration", "mechanism", "agency"]) {
			expect(config.source).toContain(`"${step}"`);
		}
	});
});

describe("materializers", () => {
	it("renders an accepted mechanism into valid frontmatter text", () => {
		const source = mechanismFrontmatter({
			id: "mechanism:incident-triage",
			slug: "incident-triage",
			title: "Incident Triage",
			definition: "Classify an alert's severity under a time budget.",
			is: ["severity classification"],
			isNot: ["waiting for full context"],
			evidence: { term: "Incident Triage", occurrences: 3, files: ["a"] },
		});

		expect(source).toContain("slug: incident-triage");
		expect(source).toContain(
			'definition: "Classify an alert\'s severity under a time budget."',
		);
		expect(source).toContain("is:");
		expect(source).toContain('  - "severity classification"');
		expect(source).toContain("Accepted from proposal");
	});

	it("renders a bound tool into frontmatter text", () => {
		const source = toolFrontmatter({
			id: "tool:incident-triage--incident-triage",
			mechanism: "incident-triage",
			name: "Incident Triage",
			slug: "incident-triage--incident-triage",
		});

		expect(source).toContain("slug: incident-triage--incident-triage");
		expect(source).toContain("mechanism: incident-triage");
		expect(source).toContain("timeboxMinutes: 10");
	});
});
