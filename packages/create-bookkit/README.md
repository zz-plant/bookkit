# create-bookkit

Creates a standalone Bookkit project: one book, with the engine copied into the project instead of installed from a registry. The project has the same `bookkit` CLI, checks, MCP server and deploy path as the bookkit repository.

Neither `create-bookkit` nor `@bookkit/astro-bookkit` is published to npm. Run the scaffolder from a clone of this repository.

## Create a project

```bash
git clone https://github.com/zz-plant/bookkit.git
cd bookkit
bun install
bun run packages/create-bookkit/src/index.ts ../my-book --title "My Book"
```

The folder must be outside the clone, and empty unless you pass `--force`.

| Option | Effect |
| --- | --- |
| `--book <slug>` | The book's slug. Default: the folder name. |
| `--title "<title>"` | The book's title. Default: from the slug. |
| `--dir <folder>` | Import a folder of Markdown as chapters. This runs `bun install` first. |
| `--force` | Create the project in a folder that already has files. Nothing there is overwritten: if a file the project needs already exists, the scaffolder lists it and stops. |
| `--upgrade` | Update an existing project's engine (see below). |

Then, in the new project:

```bash
bun install
bun run dev                    # preview the book
bun run verify -- --all        # every check: types, content, shared wrappers, build
git init && git add -A && git commit -m "First draft"   # deploy publishes from a commit
bun run deploy -- --dry-run    # check content, build, verify dist/, stop before publishing
bun run bookkit help           # every command
```

## What you get

| Path | Owner |
| --- | --- |
| `apps/<book>/src/content/book/**` | You: chapters, mechanisms, toolkit, examples, glossary, releases. |
| `apps/<book>/src/book.config.ts` | You: the book's frame, objectives and constraints, and the copy of the home page (`home`), reading hub (`readHub`) and mechanisms index (`mechanismsIndex`), typed by `BookConfig`. |
| `apps/<book>/src/pages/**`, `README.md`, `TODOS.md` | You. A page in `src/pages/` replaces the engine's page at the same URL; a new book has none, since the engine serves every page. |
| `apps/<book>/astro.config.mjs`, `tsconfig.json`, `public/_headers` | The engine: wrappers every book keeps identical. `bun run check:shims` fails if one drifts. |
| `packages/astro-bookkit/` | The engine, copied from the repository with its optional dependencies. |
| `scripts/` | The `bookkit` CLI and the checks, with every module they import. |
| `bookkit.json` | The engine version the project came from, and which scripts belong to it. |
| `bun.lock` | Starts as the repository's lockfile, so a new project installs the versions the engine is tested with. |

The project's `deploy` runs `bookkit deploy`, the same command the repository uses. It validates content, builds, checks `dist/` with `check:build`, and only then publishes to Cloudflare Workers. It publishes from a git commit, so initialize and commit the project before the first deploy; `verify` and the other checks need no repository.

## Update the engine

Pull the bookkit clone, then:

```bash
bun run packages/create-bookkit/src/index.ts ../my-book --upgrade
```

`--upgrade` replaces only the files the engine owns:
- `packages/astro-bookkit/`
- the scripts recorded in `bookkit.json`
- the shared wrappers in each book
- `tsconfig.base.json` and `bun.lock`
- the script and dependency entries it manages in `package.json`

It prints every file it changes. It never writes book content, `book.config.ts` or a page a book added itself. A file an earlier engine wrote into a book and this one serves itself (the pages, `src/layouts/`, `src/lib/`, `src/middleware.ts`) is removed; if you had edited it, your copy is saved beside it as `_<name>.before-upgrade`, where nothing reads it. Move its copy into `book.config.ts` (the home page's into `home`, the reading hub's into `readHub`, the mechanisms index's into `mechanismsIndex`), or put an edited page back under `src/pages/` reading the book from `@bookkit/astro-bookkit/routes/runtime`. When a starter file a newer engine expects is missing, such as `TODOS.md`, it adds that file without replacing any existing one. It refuses a folder that is not a Bookkit project. Afterwards, run `bun install` and `bun run verify -- --all`.

## Runbook frame

Bookkit ships a `runbook` frame with required steps, tool-to-mechanism coverage, drill ownership and escalation wiring. `bun run runbooks` audits it. To use it:
- set `frame.slug: "runbook"` and `frame.steps: ["ownership", "trigger", "steps", "escalation", "verification"]` in `book.config.ts` (or start the book with `bun run bookkit new book <slug> --frame runbook`, which writes both)
- give `00-overview.mdx` a heading for each step, its whole text the step's name (`## Ownership`, `## Trigger`, `## Steps`, `## Escalation`, `## Verification`)
- give each tool an `owner`, `drills` and `escalation` in its frontmatter

## License

CC0-1.0
