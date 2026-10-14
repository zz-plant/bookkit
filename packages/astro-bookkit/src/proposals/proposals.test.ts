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

/** Notes that keep using "context debt" in lowercase, as imported notes do. */
const handoffBodies = [
	{
		file: "/book/chapters/01-why-handoffs-fail.mdx",
		body: "Every undocumented assumption is a loan. Context debt compounds.",
	},
	{
		file: "/book/chapters/02-shift-rhythm.mdx",
		body: "Context debt piles up when the hand-off beat is skipped.",
	},
	{
		file: "/book/chapters/03-handoff-checklist.mdx",
		body: "A checklist. Context debt is paid down here.",
	},
	{
		file: "/book/chapters/05-retro-notes.mdx",
		body: "The note said looking into it: more context debt.",
	},
];

const bundleFor = (
	overrides: Partial<Parameters<typeof buildProposalBundle>[0]> = {},
) =>
	buildProposalBundle({
		book: "handoffs",
		chapters: [],
		chapterBodies: handoffBodies,
		mechanisms: [],
		tools: [],
		glossaryTerms: [],
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
	it("proposes a draft for a recurring lowercase term, with evidence and no written definition", () => {
		const bundle = bundleFor({
			causalStance: "Stuck situations resolve through bounded ownership",
		});

		expect(bundle.mechanisms).toEqual([
			{
				id: "mechanism:context-debt",
				slug: "context-debt",
				title: "Context debt",
				status: "draft",
				evidence: {
					term: "context debt",
					occurrences: 4,
					files: handoffBodies.map((body) => body.file),
					example: {
						file: "/book/chapters/01-why-handoffs-fail.mdx",
						sentence: "Context debt compounds.",
					},
				},
			},
		]);
	});

	it("does not re-propose registered vocabulary", () => {
		const bundle = bundleFor({ glossaryTerms: ["Context debt"] });

		expect(bundle.mechanisms).toEqual([]);
		expect(bundle.analysis.registered).toEqual([
			{ term: "context debt", registeredAs: "Context debt", occurrences: 4 },
		]);
	});

	it("tells nothing analyzed apart from nothing found", () => {
		expect(bundleFor({ chapterBodies: [] }).analysis).toEqual({
			chaptersRead: 0,
			wordsRead: 0,
			registered: [],
			belowThreshold: [],
		});

		const quiet = bundleFor({
			chapterBodies: [
				{ file: "a.mdx", body: "The hand-off note matters." },
				{ file: "b.mdx", body: "Write the hand-off note first." },
			],
		});
		expect(quiet.mechanisms).toEqual([]);
		expect(quiet.analysis.chaptersRead).toBe(2);
		expect(quiet.analysis.belowThreshold).toEqual([
			{ term: "hand-off note", occurrences: 2, files: 2 },
		]);
	});

	it("names a proposed tool <mechanism>--starter-tool, without repeating the mechanism", () => {
		const bundle = bundleFor({
			mechanisms: [mechanism()],
			existingFrame: "runbook",
		});

		expect(bundle.tools.map((t) => [t.slug, t.mechanism, t.name])).toEqual([
			[
				"incident-triage--starter-tool",
				"incident-triage",
				"Starter tool for Incident Triage",
			],
			[
				"context-debt--starter-tool",
				"context-debt",
				"Starter tool for Context debt",
			],
		]);
		expect(bundle.tools[0].id).toBe("tool:incident-triage--starter-tool");
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
	it("writes a draft mechanism with empty fields to fill and the evidence, not invented prose", () => {
		const [proposal] = bundleFor().mechanisms;
		const source = mechanismFrontmatter(proposal);

		expect(source).toStartWith(
			'---\nslug: context-debt\ntitle: "Context debt"\ndefinition: "" # One or two sentences',
		);
		expect(source).toContain("\nis: [] # Observable patterns");
		expect(source).toContain("\nisNot: [] # Nearby things it is not");
		expect(source).toContain("\nstatus: draft\n");
		expect(source).toContain(
			'"context debt" is used 4 times in 01-why-handoffs-fail.mdx, 02-shift-rhythm.mdx, 03-handoff-checklist.mdx, 05-retro-notes.mdx. For example, 01-why-handoffs-fail.mdx: "Context debt compounds."',
		);
		expect(source).not.toContain("repeatable pattern");
	});

	it("renders a bound tool into frontmatter text", () => {
		const source = toolFrontmatter({
			id: "tool:incident-triage--starter-tool",
			mechanism: "incident-triage",
			name: "Incident Triage",
			slug: "incident-triage--starter-tool",
		});

		expect(source).toContain("slug: incident-triage--starter-tool");
		expect(source).toContain("mechanism: incident-triage");
		expect(source).toContain("timeboxMinutes: 10");
	});
});
