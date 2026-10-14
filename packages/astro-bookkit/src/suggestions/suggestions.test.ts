import { describe, expect, it } from "bun:test";
import {
	analyzeMechanismOverlap,
	auditExampleSwappability,
	type ChapterRecord,
	classifyConcept,
	type ExampleRecord,
	extractConceptFlags,
	findRecurringTerms,
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

/** Four notes that keep using "context debt", in lowercase and at sentence starts. */
const handoffNotes = [
	{
		file: "chapters/01-why-handoffs-fail.mdx",
		body: "## Context debt\n\nEvery undocumented assumption is a loan against the next shift. Context debt compounds:\n\n- the first shift knows *why*\n- the third shift knows nothing",
	},
	{
		file: "chapters/02-shift-rhythm.mdx",
		body: "A shift has three beats. Context debt piles up when the hand-off beat is skipped.\n\n```bash\noncall handoff --context-debt\n```",
	},
	{
		file: "chapters/03-handoff-checklist.mdx",
		body: "A 10-minute checklist. Context debt is paid down here. See [the glossary](04-glossary.md#context-debt).",
	},
	{
		file: "chapters/05-retro-notes.mdx",
		body: "We lost two hours because the handoff note said looking into it. More context debt, again.",
	},
];

describe("recurring-term detection", () => {
	it("finds a recurring lowercase term, with its count, files, and an example sentence", () => {
		const [first] = extractConceptFlags(handoffNotes);

		expect(first.term).toBe("context debt");
		expect(first.occurrences).toBe(4);
		expect(first.files).toEqual([
			"chapters/01-why-handoffs-fail.mdx",
			"chapters/02-shift-rhythm.mdx",
			"chapters/03-handoff-checklist.mdx",
			"chapters/05-retro-notes.mdx",
		]);
		expect(first.example).toEqual({
			file: "chapters/01-why-handoffs-fail.mdx",
			sentence: "Context debt compounds:",
		});
	});

	it("leaves out terms registered by slug, title, or a parenthetical alias", () => {
		const bodies = [
			{
				file: "a.mdx",
				body: "Virtue extraction hides here. So does context debt.",
			},
			{
				file: "b.mdx",
				body: "Then virtue extraction again, and context debt too.",
			},
			{
				file: "c.mdx",
				body: "Virtue extraction, once more. Context debt, once more.",
			},
		];
		const report = findRecurringTerms(bodies, {
			vocabulary: ["context-debt", "Sanctiphagy (Virtue Extraction)"],
		});

		expect(report.candidates).toEqual([]);
		expect(
			report.registered.map(({ term, registeredAs }) => [term, registeredAs]),
		).toEqual([
			["context debt", "context-debt"],
			["virtue extraction", "Sanctiphagy (Virtue Extraction)"],
		]);
	});

	it("says how much it read, so finding nothing differs from reading nothing", () => {
		expect(findRecurringTerms([], {})).toMatchObject({
			filesRead: 0,
			wordsRead: 0,
			candidates: [],
		});
		const plain = findRecurringTerms(
			[{ file: "a.mdx", body: "One sentence with nothing that recurs." }],
			{},
		);
		expect(plain.filesRead).toBe(1);
		expect(plain.wordsRead).toBe(6);
		expect(plain.candidates).toEqual([]);
	});

	it("folds plurals, keeps the longer name, and skips code, headings, and template sentences", () => {
		const flags = extractConceptFlags([
			{
				file: "a.mdx",
				body: "# Sticky decision loops\n\nSticky decision loops repeat.\n\n`sticky decision loop`\n\nDraft chapter, to be written from source posts.",
			},
			{
				file: "b.mdx",
				body: "Avoiding the sticky decision loop takes practice.\n\nDraft chapter, to be written from source posts.",
			},
			{
				file: "c.mdx",
				body: "Each sticky decision loop ends somewhere.\n\nDraft chapter, to be written from source posts.",
			},
		]);

		expect(flags.map((flag) => [flag.term, flag.occurrences])).toEqual([
			["sticky decision loop", 3],
		]);
	});

	it("gives the same list in the same order every time, whatever the file order", () => {
		const once = findRecurringTerms(handoffNotes, {});
		expect(findRecurringTerms(handoffNotes, {})).toEqual(once);
		expect(findRecurringTerms([...handoffNotes].reverse(), {})).toEqual(once);
	});
});

describe("concept triage", () => {
	it("classifies recurring concepts as register candidates", () => {
		const { classification } = classifyConcept({
			term: "shiny object trap",
			occurrences: 4,
			files: ["a", "b"],
		});
		expect(classification).toBe("register");
	});

	it("classifies proper nouns, and terms used twice as review", () => {
		expect(
			classifyConcept({
				term: "Acme Corporation",
				occurrences: 3,
				files: ["a", "b"],
			}).classification,
		).toBe("proper-noun");
		expect(
			classifyConcept({ term: "dingle bop", occurrences: 2, files: ["a", "b"] })
				.classification,
		).toBe("review");
	});

	it("reports an unregistered term with its evidence", () => {
		const suggestions = triageConcepts(extractConceptFlags(handoffNotes), {
			book: "handoffs",
			vocabulary: [],
		});
		expect(suggestions[0]).toMatchObject({
			severity: "advisory",
			file: "chapters/01-why-handoffs-fail.mdx",
			message:
				'"context debt" recurs 4 times across 4 files and is not registered.',
			evidence: {
				term: "context debt",
				occurrences: 4,
				example: { sentence: "Context debt compounds:" },
				classification: "register",
			},
		});
		expect(suggestions[0].nextAction).toContain("register it");
	});

	it("drops terms the vocabulary already registers", () => {
		expect(
			triageConcepts(extractConceptFlags(handoffNotes), {
				book: "handoffs",
				vocabulary: ["Context debt"],
			}).filter((s) => s.evidence.term === "context debt"),
		).toEqual([]);
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
	it("proposes a draft for a recurring term: name and evidence, no written definition", () => {
		const suggestions = proposeMechanismCandidates({
			book: "handoffs",
			chapterBodies: handoffNotes,
			vocabulary: [],
		});

		expect(suggestions).toHaveLength(1);
		const [proposal] = suggestions;
		expect(proposal.category).toBe("mechanism-proposal");
		expect(proposal.evidence.draft).toEqual({
			slug: "context-debt",
			title: "Context debt",
			status: "draft",
			evidence: {
				term: "context debt",
				occurrences: 4,
				files: handoffNotes.map((note) => note.file),
				example: {
					file: "chapters/01-why-handoffs-fail.mdx",
					sentence: "Context debt compounds:",
				},
			},
		});
		expect(proposal.message).toContain(
			"definition and boundaries left for you",
		);
	});

	it("skips terms already in the vocabulary", () => {
		const suggestions = proposeMechanismCandidates({
			book: "handoffs",
			chapterBodies: handoffNotes,
			vocabulary: ["Context Debt"],
		});
		expect(suggestions).toHaveLength(0);
	});

	it("reports a term once when it gets a draft", () => {
		const suggestions = runBookSuggestions({
			book: "handoffs",
			mechanisms: [],
			chapters: [],
			examples: [],
			chapterBodies: handoffNotes,
			conceptFlags: extractConceptFlags(handoffNotes),
		});
		expect(
			suggestions.filter((s) => s.evidence.term === "context debt"),
		).toHaveLength(1);
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
