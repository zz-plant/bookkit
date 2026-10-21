# Proposals, AI, and MCP

> **AI may propose; the compiler decides.**

## Proposals

Three things can propose changes to a book, and none can bypass a check:

- **Analyzers.** `bun run check:suggestions [book]` lists overlapping mechanisms, recurring terms that are not registered (each with its count, files, and an example sentence), examples that restate a mechanism, and missing prerequisite edges. `bun run bookkit propose [book]` turns them into a proposal bundle: a frame reading, mechanism drafts, prerequisite edges, starter actions, and a `book.config.ts` draft. Both are deterministic (no model, no network) and write nothing until you ask.
- **Agents**, through the [MCP endpoint](#mcp): `bookkit.check_content` compiles a candidate file without writing it, and the same checks decide.
- **Judges**, an LLM or a person asked blind whether two mechanisms are one idea; see [Several books](./corpus.md).

```sh
bun run bookkit propose my-book                       # review the bundle
bun run bookkit propose my-book --write               # also save it to apps/my-book/proposals/
bun run bookkit propose my-book --apply mechanisms --apply edges   # or --apply all
```

`--apply` writes drafts into the content tree: `mechanisms/`, `toolkit/`, and chapters' `prerequisites:`. A mechanism draft has its name, `status: draft`, and the evidence, and leaves the definition, `is`, and `isNot` to you; a starter action is `<mechanism>--starter-tool`. It never overwrites a registered record, keeps the reading graph acyclic (an edge that would close a loop is skipped and named), and writes a config draft to `proposals/book.config.draft.ts`, never to the live `book.config.ts`. `--id <proposal>` keeps one proposal, and `--detect-frame` reports what the text implies even when the book declares a frame.

## Model downloads

Comparing mechanisms by meaning uses `nomic-ai/nomic-embed-text-v1.5`, about 550 MB, through the optional `@xenova/transformers` dependency. It is downloaded once, and only with consent:

- at a terminal, `bookkit check`, `bookkit similar --semantic`, and `check:corpus` ask first;
- elsewhere, `--download-model` or `BOOKKIT_DOWNLOAD_MODEL=1` allows it; without either, wording alone is compared and the output says so;
- the MCP tools compare meaning only when the model is cached or `BOOKKIT_DOWNLOAD_MODEL=1` is set in the MCP server's environment.

The cache is inside `node_modules`, so a reinstall deletes it; set `BOOKKIT_MODEL_CACHE` to keep it elsewhere. `--quick` (`bookkit check`) and `--no-semantic` (`check:corpus`) skip the model.

## MCP

Bookkit serves its content and checks to AI agents over the Model Context Protocol, in two ways:

- **stdio, in a workspace:** `bun run mcp` (`-- --book <slug>` picks the book the content tools read; the default is the first folder under `apps/`). `.mcp.json` registers it as `bookkit`, so Claude Code offers it in this repository with no server running.
- **HTTP, from a book:** `bookkit dev` answers `POST /api/mcp.json`. A static build serves only the `GET` manifest, whose `toolCalls.served` says whether the address answers tool calls; on a server deployment, `tools/call` needs the author token, and `resources/*` and `tools/list` do not.

The tools, each prefixed `bookkit.`: `list_books`, `read_book`, `list_content`, `list_mechanisms`, `list_skills`, `get_content_contract`, `check_content`, `validate_book`, `compile_book`, `export_book`, `check_separation`, `check_corpus`, `find_similar_mechanisms`, and `create_book` (`book` and `title`). `get_content_contract` returns each section's fields, its JSON Schema, and a template that compiles; `check_content` compiles one candidate file without writing it. `validate_book`, `compile_book`, and `check_content` apply the book's status rule; `releaseMode: true` on `validate_book` or `check_content` forces release rules on a draft, and `check_content` reports `bookStatus` and `releaseRules`. Results carry a `text` item with the JSON and the same object as `structuredContent`. Without MCP, `bun run bookkit contract` and `bun run bookkit check <file> --json` give the same answers.
