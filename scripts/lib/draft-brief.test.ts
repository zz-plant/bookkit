import { describe, expect, it } from "bun:test";
import {
	candidateSource,
	type DraftBriefInput,
	draftBrief,
	extractDraft,
} from "./draft-brief";

const STUB = `---
slug: the-stall
status: draft
title: "The Stall"
prerequisites:
  - opening
mechanisms:
  - slow-walk
---

## Claim

A stall is a decision.
`;

const DRAFT = `---
slug: the-stall
status: draft
title: "The Stall"
mechanisms:
  - slow-walk
---

## Claim

A stall is a decision. Someone chose the pace.
`;

describe("extractDraft", () => {
	it("returns a bare chapter file as it is", () => {
		expect(extractDraft(DRAFT)).toBe(DRAFT);
	});

	it("takes the file out of a code fence, with prose before and after", () => {
		expect(
			extractDraft(
				`Here is the chapter:\n\n\`\`\`mdx\n${DRAFT}\`\`\`\n\nLet me know if you want changes.`,
			),
		).toBe(DRAFT);
	});

	it("drops a model's thinking and whatever comes before the frontmatter", () => {
		expect(
			extractDraft(
				`<think>\nThe stub has one claim.\n---\nPlan: three sections.\n</think>\nSure.\n${DRAFT}`,
			),
		).toBe(DRAFT);
	});

	it("takes the file after what ollama run prints for a model that thinks, not the stub quoted in its thinking", () => {
		expect(
			extractDraft(
				`Thinking...\nThe stub is:\n\`\`\`\n${STUB}\`\`\`\nI will write three sections.\n...done thinking.\n\n${DRAFT}`,
			),
		).toBe(DRAFT);
		// The same when the thinking is not marked off: the last file wins.
		expect(extractDraft(`The stub is:\n\n${STUB}\nMy draft:\n\n${DRAFT}`)).toBe(
			DRAFT,
		);
	});

	it("stops at the end of the fence, and keeps a rule inside the body", () => {
		const ruled = DRAFT.replace("Someone chose", "\n\n---\n\nSomeone chose");
		expect(extractDraft(`\`\`\`markdown\n${ruled}\`\`\`\nDone.`)).toBe(ruled);
	});

	it("takes a reply with no frontmatter as the body", () => {
		expect(extractDraft("## Claim\n\nA stall is a decision.\n\n")).toBe(
			"## Claim\n\nA stall is a decision.\n",
		);
	});
});

describe("candidateSource", () => {
	it("keeps the stub's slug, title, status, and prerequisites, whatever the draft says", () => {
		const candidate = candidateSource(
			STUB,
			`---
slug: stalling
status: published
title: "Stalling, Explained"
prerequisites: []
order: 1
mechanisms:
  - slow-walk
  - tidy-desk
summary: "Why a stall is a choice."
---

## Claim

Body.
`,
		);
		expect(candidate).toBe(`---
slug: the-stall
status: draft
title: The Stall
prerequisites:
  - opening
mechanisms:
  - slow-walk
  - tidy-desk
summary: Why a stall is a choice.
---

## Claim

Body.
`);
	});

	it("puts a draft with no frontmatter under the stub's, unchanged", () => {
		expect(candidateSource(STUB, "## Claim\n\nBody.\n")).toBe(`---
slug: the-stall
status: draft
title: The Stall
prerequisites:
  - opening
mechanisms:
  - slow-walk
---

## Claim

Body.
`);
	});

	it("keeps a draft's empty mechanisms list, and gives the same file when applied twice", () => {
		const once = candidateSource(
			STUB,
			"---\nmechanisms: []\n---\n\n## Claim\n\nBody.\n",
		);
		expect(once).toContain("mechanisms: []");
		expect(once).not.toContain("slow-walk");
		expect(candidateSource(STUB, once)).toBe(once);
	});
});

describe("draftBrief", () => {
	const input: DraftBriefInput = {
		bookTitle: "Tiny",
		stance: "Delay is chosen.",
		reader: {
			start: "Someone kept waiting.",
			end: "Can name who set the pace.",
		},
		stub: STUB,
		outline: [
			{ title: "Opening", current: false },
			{ title: "The Stall", current: true },
		],
		bound: [
			{
				slug: "slow-walk",
				title: "Slow walk",
				definition: "Processing a request at a crawl on purpose.",
				is: ["A pace someone chose."],
				isNot: ["A backlog nobody controls."],
				tests: ["Ask who could have gone faster."],
			},
		],
		others: [
			{
				slug: "tidy-desk",
				title: "Tidy desk",
				definition: "Filing every record by colour.",
			},
		],
		glossary: ["Queue"],
		sample: {
			title: "Opening",
			body: "## Claim\n\nEvery wait has an owner.\n",
		},
		notes: [{ name: "stall.md", text: "The clerk told me to come back." }],
		targetWords: 140,
		minimumWords: 60,
	};

	it("holds the stub, the mechanisms, the notes, the sample, and the length", () => {
		const brief = draftBrief(input);
		expect(brief).toContain(`<stub>\n${STUB.trim()}\n</stub>`);
		expect(brief).toContain("→ 2. The Stall");
		expect(brief).toContain("### Slow walk (`slow-walk`)");
		expect(brief).toContain("It is not:\n- A backlog nobody controls.");
		expect(brief).toContain(
			"- `tidy-desk` — Tidy desk: Filing every record by colour.",
		);
		expect(brief).toContain(
			'<notes file="stall.md">\nThe clerk told me to come back.\n</notes>',
		);
		expect(brief).toContain("<sample>\n## Claim\n\nEvery wait has an owner.");
		expect(brief).toContain("About 140 words of prose, and at least 60.");
	});

	it("leaves out the sections a book has nothing for", () => {
		const brief = draftBrief({
			...input,
			bound: [],
			others: [],
			glossary: [],
			sample: undefined,
			notes: [],
			minimumWords: 0,
		});
		expect(brief).not.toContain("## Mechanisms this chapter binds");
		expect(brief).not.toContain("other mechanisms");
		expect(brief).not.toContain("notes for this chapter");
		expect(brief).not.toContain("<sample>");
		expect(brief).toContain("About 140 words of prose.");
	});
});
