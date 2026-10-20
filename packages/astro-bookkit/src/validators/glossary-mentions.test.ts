import { describe, expect, it } from "bun:test";

import {
	firstUnlinkedGlossaryMentions,
	glossaryTermsFrom,
} from "./glossary-mentions";

const terms = glossaryTermsFrom([
	{
		file: "/book/glossary/severity.mdx",
		source: '---\nterm: "Severity"\ndefinition: "How bad it is."\n---\n',
	},
	{
		file: "/book/glossary/escalation-ramp.mdx",
		source: '---\nslug: ramp\nterm: "Escalation ramp"\n---\n',
	},
	{
		file: "/book/glossary/triage.mdx",
		source: '---\nterm: "Triage"\n---\n',
	},
	{
		file: "/book/glossary/es/severidad.mdx",
		source: '---\nterm: "Severidad"\nlocale: es\n---\n',
	},
]);

const chapter = (body: string, frontmatter = 'title: "A"') => ({
	file: "/book/chapters/01-a.mdx",
	source: `---\n${frontmatter}\n---\n${body}`,
});

const lines = (body: string, frontmatter?: string) =>
	firstUnlinkedGlossaryMentions(chapter(body, frontmatter), terms).map(
		(mention) => [mention.term, mention.line, mention.slug],
	);

describe("glossary terms a chapter uses before linking them", () => {
	it("names each term's first use, by its line in the file, with the entry's slug", () => {
		expect(
			lines(
				"\nAssign a severity first.\n\nThen the escalation ramp, then severity again.\n",
			),
		).toEqual([
			["Severity", 5, "severity"],
			["Escalation ramp", 7, "ramp"],
		]);
	});

	it("leaves out a term linked at its first use, even when a later use is not", () => {
		expect(
			lines(
				"See [severity](/read/glossary/severity).\n\nSeverity drives the ramp.\n",
			),
		).toEqual([]);
		expect(
			lines(
				'Read <a href="/read/glossary/ramp">the escalation ramp</a>, or [the steps][ramp].\n',
			),
		).toEqual([]);
	});

	it("reads only prose: no headings, code, comments, or link addresses", () => {
		expect(
			lines(
				[
					"## Severity",
					"```sh",
					"severity --level 1",
					"```",
					"Run `severity` now. {/* severity notes */}",
					"Go to [the list](/read/glossary/severity) or <https://example.com/severity>.",
					"Then decide the severity.",
				].join("\n"),
			),
		).toEqual([["Severity", 10, "severity"]]);
	});

	it("matches any case and plurals as whole words only", () => {
		expect(lines("Two SEVERITIES were triaged.\n\nWe triage.\n")).toEqual([
			["Severity", 4, "severity"],
			["Triage", 6, "triage"],
		]);
	});

	it("matches a chapter to the terms of its own locale", () => {
		expect(
			lines("La severidad y la severity.\n", 'title: "A"\nlocale: es'),
		).toEqual([["Severidad", 5, "severidad"]]);
	});
});
