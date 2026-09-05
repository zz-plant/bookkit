import { describe, expect, it } from "bun:test";
import {
	analyzeMechanismOverlap,
	auditExampleSwappability,
	type ChapterRecord,
	classifyConcept,
	type ExampleRecord,
	extractConceptFlags,
	type MechanismRecord,
	proposeMechanismCandidates,
	runBookSuggestions,
	suggestPrerequisiteEdges,
	triageConcepts,
} from "./index";

const mechanism = (overrides: Partial<MechanismRecord>): MechanismRecord => ({
	slug: "m",
	title: "M",
	definition: "A repeatable pattern.",
	is: [],
	isNot: [],
	predictions: [],
	tests: [],
	...overrides,
});

describe("tokenize + overlap", () => {
	it("flags near-identical mechanisms and reports shared boundaries", () => {
		const suggestions = analyzeMechanismOverlap(
			[
				mechanism({
					slug: "delegation",
					title: "Delegation",
					definition:
						"Assign tasks to others with clear ownership and checkpoints.",
					is: ["explicit ownership", "clear checkpoints"],
					isNot: ["micromanaging others"],
				}),
				mechanism({
					slug: "task-shifting",
					title: "Task Shifting",
					definition:
						"Assign tasks to others and review progress at checkpoints.",
					is: ["explicit ownership", "clear checkpoints"],
					isNot: ["doing everything yourself"],
				}),
			],
			{ book: "test" },
		);

		expect(suggestions.length).toBeGreaterThan(0);
		const suggestion = suggestions[0];
		expect(suggestion.category).toBe("mechanism-overlap");
		expect(suggestion.evidence.sharedBoundaryPhrases).toEqual([
			"explicit ownership",
			"clear checkpoints",
		]);
	});

	it("does not flag genuinely distinct mechanisms", () => {
		const suggestions = analyzeMechanismOverlap(
			[
				mechanism({
					slug: "timeboxing",
					title: "Timeboxing",
					definition: "Limit a task to a fixed short duration.",
					is: ["fixed duration"],
					isNot: ["open-ended sessions"],
				}),
				mechanism({
					slug: "peer-review",
					title: "Peer Review",
					definition: "Ask a colleague to check work before shipping.",
					is: ["second reader"],
					isNot: ["self-review only"],
				}),
			],
			{ book: "test" },
		);

		expect(suggestions).toHaveLength(0);
	});
});

describe("concept triage", () => {
	it("extracts multi-word concepts and counts across files", () => {
		const flags = extractConceptFlags([
			{
				file: "ch1.mdx",
				body: "The Shiny Object Trap keeps pulling attention away.",
			},
			{ file: "ch2.mdx", body: "Another chapter about the Shiny Object Trap." },
		]);

		expect(
			flags.some((f) => f.term === "Shiny Object Trap" && f.files.length === 2),
		).toBe(true);
	});

	it("classifies recurring concepts as register candidates", () => {
		const { classification } = classifyConcept(
			{ term: "Shiny Object Trap", occurrences: 4, files: ["a", "b"] },
			new Set(),
		);
		expect(classification).toBe("register");
	});

	it("classifies proper nouns and throwaways", () => {
		expect(
			classifyConcept(
				{ term: "Acme Corporation", occurrences: 1, files: ["a"] },
				new Set(),
			).classification,
		).toBe("proper-noun");
		expect(
			classifyConcept(
				{ term: "Dingle Bop", occurrences: 1, files: ["a"] },
				new Set(),
			).classification,
		).toBe("throwaway");
	});

	it("emits register severity advisory and skips nothing", () => {
		const suggestions = triageConcepts(
			[{ term: "Shiny Object Trap", occurrences: 4, files: ["a", "b"] }],
			{ book: "test", vocabulary: [] },
		);
		expect(suggestions[0].severity).toBe("advisory");
		expect(suggestions[0].nextAction).toContain("Register");
	});
});

describe("example swap audit", () => {
	const mechanismRecord = mechanism({
		slug: "bounded-steps",
		title: "Bounded Steps",
		definition: "Convert a task into small accountable steps with a deadline.",
		is: ["small accountable steps", "explicit deadline"],
		isNot: ["open-ended effort"],
	});

	const example: ExampleRecord = {
		mechanism: "bounded-steps",
		domain: "home",
		title: "Decluttering One Shelf",
		body: "I broke the shelf into small accountable steps with an explicit deadline.",
	};

	it("flags examples that restate the mechanism definition", () => {
		const suggestions = auditExampleSwappability([example], {
			book: "test",
			mechanisms: [mechanismRecord],
		});
		expect(
			suggestions.some(
				(s) => s.category === "example-swap" && s.severity === "advisory",
			),
		).toBe(true);
	});

	it("warns when an example carries mechanism contract fields in frontmatter", () => {
		const suggestions = auditExampleSwappability(
			[{ ...example, frontmatterKeys: ["mechanism", "domain", "title", "is"] }],
			{ book: "test", mechanisms: [mechanismRecord] },
		);
		expect(suggestions.some((s) => s.severity === "warning")).toBe(true);
	});

	it("leaves replaceable concrete examples alone", () => {
		const suggestions = auditExampleSwappability(
			[
				{
					...example,
					body: "On Saturday I emptied one shelf onto the couch, kept the two lamps, and gave the rest away.",
				},
			],
			{ book: "test", mechanisms: [mechanismRecord] },
		);
		expect(suggestions).toHaveLength(0);
	});
});

describe("prerequisite edge suggestions", () => {
	const chapters: ChapterRecord[] = [
		{
			slug: "intro",
			title: "Intro",
			mechanisms: ["bounded-steps"],
			prerequisites: [],
		},
		{
			slug: "later",
			title: "Later",
			mechanisms: ["bounded-steps"],
			prerequisites: [],
		},
	];

	it("suggests adding the introducing chapter as a prerequisite", () => {
		const suggestions = suggestPrerequisiteEdges({
			book: "test",
			chapters,
			mechanismSlugs: ["bounded-steps"],
		});

		expect(
			suggestions.some(
				(s) =>
					s.evidence.chapter === "later" && s.evidence.introducedIn === "intro",
			),
		).toBe(true);
	});

	it("does not suggest an edge that would create a cycle", () => {
		const suggestions = suggestPrerequisiteEdges({
			book: "test",
			chapters: [
				{ slug: "a", title: "A", mechanisms: ["m"], prerequisites: ["b"] },
				{ slug: "b", title: "B", mechanisms: ["m"], prerequisites: [] },
			],
			mechanismSlugs: ["m"],
		});

		expect(
			suggestions.some(
				(s) => s.evidence.chapter === "a" && s.evidence.introducedIn === "b",
			),
		).toBe(false);
	});

	it("reports registered mechanisms no chapter lists", () => {
		const suggestions = suggestPrerequisiteEdges({
			book: "test",
			chapters: [{ slug: "c", title: "C", mechanisms: [], prerequisites: [] }],
			mechanismSlugs: ["ghost"],
		});
		expect(suggestions.some((s) => s.evidence.unreferenced === true)).toBe(
			true,
		);
	});

	it("flags mechanism slugs referenced in prose but missing from frontmatter", () => {
		const suggestions = suggestPrerequisiteEdges({
			book: "test",
			chapters: [
				{
					slug: "c",
					title: "C",
					mechanisms: [],
					prerequisites: [],
					body: "Rely on bounded-steps when the load is high.",
				},
			],
			mechanismSlugs: ["bounded-steps"],
		});
		expect(suggestions.some((s) => s.evidence.proseReference === true)).toBe(
			true,
		);
	});
});

describe("mechanism proposals", () => {
	it("proposes candidates from recurring concepts with a draft skeleton", () => {
		const suggestions = proposeMechanismCandidates({
			book: "test",
			chapterBodies: [
				{ file: "a.mdx", body: "The Sticky Decision Loop repeats." },
				{
					file: "b.mdx",
					body: "Avoiding the Sticky Decision Loop takes practice.",
				},
			],
			vocabulary: [],
			causalStance: "Stuck situations resolve through bounded ownership",
		});

		expect(suggestions.length).toBeGreaterThan(0);
		const proposal = suggestions[0];
		expect(proposal.category).toBe("mechanism-proposal");
		expect(proposal.evidence.draft).toMatchObject({
			title: "Sticky Decision Loop",
		});
	});

	it("skips terms already in the vocabulary", () => {
		const suggestions = proposeMechanismCandidates({
			book: "test",
			chapterBodies: [
				{ file: "a.mdx", body: "The Sticky Decision Loop repeats." },
				{
					file: "b.mdx",
					body: "Avoiding the Sticky Decision Loop takes practice.",
				},
			],
			vocabulary: ["Sticky Decision Loop"],
		});
		expect(suggestions).toHaveLength(0);
	});
});

describe("runBookSuggestions orchestrator", () => {
	it("returns a combined set across all analyzers", () => {
		const suggestions = runBookSuggestions({
			book: "test",
			mechanisms: [
				mechanism({ slug: "bounded-steps", title: "Bounded Steps" }),
			],
			chapters: [
				{
					slug: "intro",
					title: "Intro",
					mechanisms: ["bounded-steps"],
					prerequisites: [],
				},
			],
			examples: [
				{
					mechanism: "bounded-steps",
					domain: "home",
					title: "One Shelf",
					body: "Concrete replaceable detail.",
				},
			],
			chapterBodies: [{ file: "intro.mdx", body: "Bounded Steps used again." }],
			conceptFlags: [
				{ term: "Sticky Decision Loop", occurrences: 3, files: ["a", "b"] },
			],
		});

		expect(suggestions.length).toBeGreaterThan(0);
	});
});
