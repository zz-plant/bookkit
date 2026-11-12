import { describe, expect, it } from "bun:test";
import {
	createLlmsTxt,
	llmsEntries,
	markdownCopy,
	markdownCopyPath,
} from "./llms";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

const modules = {
	chapters: {
		"/src/content/book/chapters/01-drills.mdx": `---\nslug: drills\ntitle: "Drills"\nsummary: "Practice before the page."\n---\n\n{/* author note */}\n\n## Claim\n\n${words(80)}.\n`,
		"/src/content/book/chapters/02-stub.mdx":
			"---\nslug: stub\ntitle: Stub\n---\n\nToo short.\n",
		"/src/content/book/chapters/fr/01-drills.mdx": `---\nslug: drills\ntitle: "Exercices"\n---\n\n${words(80)}.\n`,
	},
	mechanisms: {
		"/src/content/book/mechanisms/rollback-first.mdx":
			'---\nslug: rollback-first\ntitle: "Rollback first"\ndefinition: "Undo the change before diagnosing it."\nisNot:\n  - "Skipping the postmortem."\n---\n',
	},
};

describe("llmsEntries", () => {
	it("lists each entry in the default locale, leaves stub chapters out, and notes each by its summary or definition", () => {
		const entries = llmsEntries(modules);
		expect(
			entries.map(({ section, slug, title, note }) => ({
				section,
				slug,
				title,
				note,
			})),
		).toEqual([
			{
				section: "chapters",
				slug: "drills",
				title: "Drills",
				note: "Practice before the page.",
			},
			{
				section: "mechanisms",
				slug: "rollback-first",
				title: "Rollback first",
				note: "Undo the change before diagnosing it.",
			},
		]);
	});
});

describe("markdownCopy", () => {
	it("drops MDX comments and imports, and keeps the frontmatter", () => {
		const copy = markdownCopy(
			'---\nslug: a\n---\n\nimport X from "./x";\n\n{/* note */}\n\n## Claim\n\nText.\n',
		);
		expect(copy).toBe("---\nslug: a\n---\n\n## Claim\n\nText.\n");
	});
});

describe("createLlmsTxt", () => {
	it("links each entry's Markdown copy under its section, with the site's address", () => {
		const txt = createLlmsTxt({
			title: "On-Call Runbook",
			description: "What to do when the pager goes off.",
			site: { url: "https://oncall.example", indexable: true },
			entries: llmsEntries(modules),
		});
		expect(txt).toStartWith(
			"# On-Call Runbook\n\n> What to do when the pager goes off.\n",
		);
		expect(txt).toContain(
			"## Chapters\n\n- [Drills](https://oncall.example/md/chapters/drills.md): Practice before the page.",
		);
		expect(txt).toContain(
			"## Mechanisms\n\n- [Rollback first](https://oncall.example/md/mechanisms/rollback-first.md)",
		);
		expect(txt).toContain(
			"## Optional\n\n- [MCP manifest](https://oncall.example/api/mcp.json)",
		);
		expect(txt).not.toContain("## Tools");
	});

	it("lists nothing for a book closed to crawlers", () => {
		const txt = createLlmsTxt({
			title: "Draft",
			site: { indexable: false },
			entries: llmsEntries(modules),
		});
		expect(txt).toBe(
			"# Draft\n\nThis book is not open to automated readers: it is a draft, or its site.indexable is false (as it is outside a production build in most books).\n",
		);
	});

	it("serves a copy at the path the index links", () => {
		expect(
			markdownCopyPath({ section: "toolkit", slug: "page-the-owner" }),
		).toBe("/md/toolkit/page-the-owner.md");
	});
});
