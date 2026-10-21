# Import and exports

## Import

`bun run bookkit import <book> --dir <folder>` reads `.md`, `.mdx`, and `.markdown` files, subfolders included. `--dry-run` prints the plan and writes nothing.

- **Titles and order.** A note's title comes from its frontmatter `title`, else its first `#` heading, else its file name; a leading `# Title` is removed from the body so it does not repeat. Ordering prefixes in file names (`01-`, `1.`, dates) set the reading order. `summary` or `description` carries over.
- **Drafts.** Notes in a `drafts/` folder, or with `draft: true` or `published: false`, import as drafts; the rest as published.
- **Skipped.** `README` and `index` files are skipped unless `--include-readme`. Frontmatter fields chapters have no place for (`tags`, `date`, …) are listed.
- **Links and images.** Links between notes point at the new chapters, and local images are copied to `public/images/`. Wiki links, as Obsidian writes them, convert too: `[[Note]]` and `[[Note#Heading|text]]` (a note named by its file name, in any folder, or its title) become links, and `![[image.png]]` an image; one that names no note keeps its text and is listed. `bookkit try` counts them, and takes the book's title from the folder's README heading. An address the link rule refuses is removed, the link keeps its words, and the report lists it under "Addresses removed" with its note and line.
- **MDX.** HTML comments become MDX comments, `<https://…>` autolinks become links, and `{braces}`, tag-like `<placeholders>`, and `import`/`export` lines are escaped, so they render as written; code is left as it was. Common HTML is kept (`<details>`, `<kbd>`, `<img>`, `<sup>`, `<sub>`, tables, and an `<iframe>` with a web address), minus what the allowlist refuses, and other tags show as text. A note's `<script>` and `<style>` go with what they hold, an `<iframe>` with no title gets one from the page it shows, and the report lists all of it under "HTML left out".
- **Compiled.** Every chapter is compiled with the book's MDX compiler, and a failure names the chapter, line, and source note.
- **Re-import.** Importing the same folder again updates chapters in place and appends new notes. A chapter edited since its import is kept unless `--force`; `chapters/imported.json` records what came from where.

## Exports

`bookkit build` writes `dist/exports/book.pdf` and `dist/exports/book.epub`, plus one PDF and EPUB per chapter under `dist/exports/chapters/`. The book files hold the whole book in reading order: the chapters, each mechanism followed by its actions, the glossary, and the examples, with a table of contents and, in the PDF, bookmarks. Title, author, and language come from `book.config.ts`, the version and date from the latest release note, and a rebuild of unchanged content is byte-identical.

- **Markdown.** Inline code, fenced code at any indentation, GFM tables, task lists, nested lists, reference-style links, footnotes, setext headings, rules, and HTML character references. The PDF draws code in Courier, tables as a grid that fits the page (row by row when columns would be too narrow), and footnotes as numbered notes after each entry; the EPUB uses EPUB 3 endnotes that link back.
- **HTML.** The tags import keeps render in both formats: `<kbd>`, `<details>` (shown open, its summary in bold), `<sup>`, `<sub>`, HTML tables and lists, and `align`. Other tags show their text, a script's text never shows, and an embed (`<iframe>`) becomes a link to the page it shows, named by its title.
- **Links.** Headings carry the site's ids. In the PDF, text is set in bold and italic faces and links are clickable: to a chapter, mechanism, or heading inside the PDF (`book.pdf#nameddest=chapters/overview`), else to the site. A link whose scheme the link rule refuses shows only its text.
- **Images.** Images under the book's `public/` folder are embedded: PNG, JPEG, GIF, SVG, and WebP in the EPUB, PNG and JPEG in the PDF. A remote image (never downloaded), a missing file, or a format the export cannot carry shows its alt text instead, and the build warns; an image with no alt text is left out.
- **Scripts.** The PDF's fonts cover Latin (with Latin Extended and Vietnamese), Greek, and Cyrillic, using Noto Sans (SIL Open Font License) beyond Western European text. For another script, such as CJK, set `exports.pdfFont`. Text the fonts cannot draw, or a script that needs shaping such as Devanagari, stops the build with the entries and characters at fault; set `exports: { pdf: false }` to publish the EPUB alone.

`bun run bookkit export [book]` (or `bun run export:gitbook -- --book <book>`) writes a GitBook folder: one page per record in reading order, a `SUMMARY.md` with parts and nested actions, MDX converted to Markdown, links rewritten, local images in `.gitbook/assets/`, and the site's link rule and HTML allowlist applied. The default folder, `apps/<book>/exports/gitbook`, is gitignored; `--out <dir>` must be missing, empty, or an earlier export.

`bun run bookkit export [book] --rubric` writes the book's corpus (the shared corpus when `corpus.json` lists the book) as an eval rubric, `apps/<book>/exports/rubric.json` unless `--out <file>`, for grading text outside Bookkit against the book's ideas: a model's answers, someone else's draft, a case write-up.

- **`criteria`**: one per mechanism, with its slug as a stable id, its definition, when it applies (`appliesWhen`, from `is`) and when it does not (`notWhen`, from `isNot`), its predictions and tests, the mechanisms you ruled a different idea with your reasons (`distinctFrom`), and those merged into it (`mergedFrom`).
- **`pairs`**: your rulings as labelled examples. A merge is `same_idea`, with both texts as they read before it; a distinct ruling is `distinct`, with its reason. These are hard cases a grader gets wrong: different ideas that read alike.
- **`rule`** is the merge rule judges are asked, and **`version`** changes whenever any criterion's text does, so a score can name the rubric it was given against.
