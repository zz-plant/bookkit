/**
 * Headings and the ids the site gives them, so a link to
 * `/read/chapters/x#heading` lands on the heading wherever Bookkit makes one:
 * the EPUB, the PDF, the search index, and the frame check. Each id is the
 * one Astro 7.3.8 gave the same heading on a built chapter page:
 * github-slugger over the heading's text after smart punctuation turned `--`
 * and `---` into dashes (but not in code), one slugger per page, and no id
 * for a heading written as an HTML tag.
 *
 * Shared by exports/heading-ids.test.ts and utils/markdown-headings.test.ts.
 */
export const SITE_HEADING_IDS: ReadonlyArray<[string, string | null]> = [
	['Don\'t -- stop: the "quick" fix...', "dont--stop-the-quick-fix"],
	["Café & crème — 100% (beta)", "café--crème--100-beta"],
	["Tuning `max_retries`", "tuning-max_retries"],
	["Tuning `max_retries`", "tuning-max_retries-1"],
	["Step 1. Check <kbd>Ctrl</kbd>", "step-1-check-ctrl"],
	["C++ / C# & .NET", "c--c--net"],
	["Привет, мир!", "привет-мир"],
	["Emoji 🚀 launch", "emoji--launch"],
	["API_KEY__value -- x --- y", "api_key__value--x--y"],
	["Code `a--b` keeps -- its dashes", "code-a--b-keeps--its-dashes"],
	[
		"[Linked heading](https://example.com) and *emphasis*",
		"linked-heading-and-emphasis",
	],
	["trailing punctuation?!", "trailing-punctuation"],
	["<h2>HTML heading</h2>", null],
	["HTML heading", "html-heading"],
	["1. Numbered", "1-numbered"],
];
