# Bookkit — Recompilable Books (Astro + Bun)

<p align="center">
  <img src="docs/assets/bookkit-demo.gif" alt="bookkit demo animation" width="720">
</p>

Bookkit is a **book compiler workspace**: one reusable engine + one or more book apps.

> A book is a specification that compiles into coherent reader experiences, not a static pile of chapters.

---

## TL;DR (for developers and agents)

- **Engine logic** lives in `packages/astro-bookkit/**`.
- **Book decisions** live in `apps/<book>/src/book.config.ts`.
- **Book content bindings** live in `apps/<book>/src/content/book/**`.
- Do not put book-specific behavior in content files.
- Run `bun run validate` before opening a PR.

For contribution lanes and workflow, see [`CONTRIBUTING.md`](./CONTRIBUTING.md). For non-negotiable architectural rules, see [`AGENTS.md`](./AGENTS.md).

---

## Documentation map

| Document | Canonical for | Audience |
| --- | --- | --- |
| [`README.md`](./README.md) | Architecture + operational commands | Developers + maintainers |
| [`AGENTS.md`](./AGENTS.md) | Architectural invariants + risk boundaries | Agents + reviewers |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Contribution workflow + lanes | Human + AI contributors |
| [`docs/authorship-model.md`](./docs/authorship-model.md) | "Book as Software" philosophy + three-pillar model | Authors + strategists |
| [`packages/astro-bookkit/README.md`](./packages/astro-bookkit/README.md) | Engine-local orientation | Engine contributors |
| [`apps/bad-people/README.md`](./apps/bad-people/README.md) | Book-app-local orientation | Book contributors |
| [`docs/mcp-agent-skills-research.md`](./docs/mcp-agent-skills-research.md) | MCP + agent-skill adoption options | Maintainers + AI workflow designers |
| [`docs/commercial-roadmap.md`](./docs/commercial-roadmap.md) | Productization scope + sequencing | Maintainers + operators |

Prefer linking to canonical docs over duplicating policy text.

---

## Commercial direction (platform roadmap)

Bookkit's highest-priority commercialization path is a hosted product direction that keeps architecture invariants intact:

1. **Managed platform core** (hosted compile + validate + export workflows)
2. **Enterprise MCP workflows** (deterministic tools, discovery profile, auditable metadata)
3. **Governance-first operations** (strict separation, frame checks, actionable validation output)

This positions Bookkit as a compiler + governance + AI-interface platform for high-trust knowledge products.

For phased scope and implementation sequencing, see [`docs/commercial-roadmap.md`](./docs/commercial-roadmap.md).

---

## Workspace architecture

Bookkit treats a book as an **executable specification**, not a static document. This "Book as Software" model is built on three pillars: structured framing, recompilable separation of concerns, and agentic interaction. For the full philosophy, see [`docs/authorship-model.md`](./docs/authorship-model.md).

Bookkit enforces strict separation of concerns:

1. **Author decisions (scarce + irreversible)**  
   `apps/<book>/src/book.config.ts`
2. **Engine/compiler logic (reusable)**  
   `packages/astro-bookkit/**`
3. **Replaceable bindings (book content)**  
   `apps/<book>/src/content/book/**`

This keeps books recompilable while allowing iterative content edits.

### Repo layout

```txt
.
├─ package.json              # workspace scripts (no per-book scripts)
├─ apps/
│  ├─ bad-people/
│  │  ├─ src/book.config.ts
│  │  └─ src/content/book/
│  │     ├─ chapters/
│  │     ├─ mechanisms/
│  │     ├─ toolkit/
│  │     ├─ examples/
│  │     ├─ glossary/
│  │     └─ releases/
│  ├─ crumple-zone/
│  └─ running-hot/
├─ packages/
│  └─ astro-bookkit/
│     └─ src/
│        ├─ book/             # graph engine, runtime, entrypoints
│        ├─ frames/           # structural requirements
│        ├─ schemas/          # Zod frontmatter schemas
│        ├─ validators/       # book + separation + frame validators
│        ├─ mcp/              # MCP tool handlers + endpoint
│        ├─ exports/          # PDF/EPUB generation
│        ├─ markdown/         # heading extraction, slugger
│        ├─ layouts/          # BookLayout + UI islands
│        └─ components/       # shared Astro components
├─ scripts/                   # CLI tasks + governance checks
├─ tests/                     # root-level test suites
├─ docs/                      # roadmap, critiques, research
└─ .github/workflows/ci.yml  # CI quality gate
```

Use `bun run list:books` as the source of truth for currently active books.

---

## Book bootstrap and wrapper pattern

Each book app should bootstrap the shared engine exactly once in `apps/<book>/src/lib/book-runtime.ts`.
That file is allowed to stay app-local because Astro/Vite require local `import.meta.glob()` calls for content discovery.
Everything else should lean on shared engine helpers or canonical wrapper templates instead of ad-hoc copy/paste.

### What stays app-local

- `src/lib/book-runtime.ts` for file-local `import.meta.glob()` wiring.
- `src/pages/api/**` and `src/pages/exports/**` route files, because Astro's file-based routing discovers handlers by filename.
- The tiny MCP route call that passes `import.meta.url` into the shared helper.

### What should be shared

- Runtime aliasing belongs in `packages/astro-bookkit/src/book/**`.
- Compatibility shims such as `src/lib/book-entrypoints.ts` and `src/lib/release-notes.ts` should re-export from `book-runtime`.
- Canonical wrapper file contents live in `packages/astro-bookkit/templates/book-app/**` and are enforced with `bun run check:shims` / `bun run sync:shims`.

This keeps book apps compliant with Astro's routing constraints while avoiding drift between books.

---

## Prerequisites

- **Bun 1.3+** (workspace package manager + task runner)
- **Node.js 22+** for Astro 7 compatibility

Install dependencies:

```bash
bun install
```

### Codex setup (recommended)

To bootstrap local Codex usage for this repo (dependency install + skill linking + baseline checks):

```bash
bun run setup:codex
```

For faster iteration (skip install/checks), run:

```bash
bash scripts/codex-setup.sh --skip-install --skip-checks
```

---

## Daily commands

### Run a book app

```bash
bun run bookkit dev bad-people
bun run bookkit dev running-hot
```

### Lint / format / types

```bash
bun run lint
bun run format
bun run check:types
```

### Tests

```bash
bun run test
```

### Validation

```bash
bun run validate
bun run validate:release
```

### Full upgrade safety net

```bash
bun run check:upgrade
bun run check:upgrade -- --release
```

### Build / compile / export

```bash
bun run bookkit build bad-people
bun run compile:book -- --book bad-people
bun run export:gitbook -- --book bad-people
```

### Helpful utilities

```bash
bun run list:books
bun run check:separation
bun run check:concepts
bun run check:suggestions
bun run check:todos
bun run check:shims
bun run stack:capabilities
```

`bun run check:suggestions [--book <slug>]` is the AI assistance layer: it analyzes a book and reports actionable, deterministic suggestions — overlapping mechanisms, unregistered recurring concepts (with candidate mechanism drafts), examples that restate a mechanism instead of illustrating it, and missing prerequisite edges for the reading graph. It never writes files; it proposes and you approve.

### MCP endpoint for agentic clients

Book apps expose an MCP endpoint (for example `apps/bad-people/src/pages/api/mcp.json.ts`) so agentic LLM clients can:

- list/read content and governance resources
- discover lane skills under `.opencode/skills/**`
- call deterministic workspace tools (`bookkit.list_books`, `bookkit.read_book`, `bookkit.list_skills`, `bookkit.validate_book`, etc.)
- scaffold a new book via guarded mutation tooling (`bookkit.create_book`) when explicit creation is required

Use this as the default machine interface instead of ad-hoc repository scraping.

### CI

GitHub Actions runs on every push and PR to `main`:

- `bun run lint` — Biome style check
- `bun run check:types` — TypeScript across all apps + package
- `bun run check:separation` — content boundary enforcement
- `bun run check:todos` — TODO policy check
- `bun run check:shims` — shim consistency
- `bun run validate` — schema + frame validation for all books
- `bun run test` — Bun test runner across all suites


### Task-driven command recipes

| If you need to… | Run | Why |
| --- | --- | --- |
| iterate on one book UI quickly | `bun run bookkit dev bad-people` | Fast local feedback loop for content + layout work |
| verify architecture invariants before review | `bun run validate && bun run check:separation` | Catches frame/content boundary regressions |
| sanity-check concept registry hygiene | `bun run check:concepts` | Prevents floating named concepts |
| get AI-style editing suggestions | `bun run check:suggestions -- --book bad-people` | Flags overlaps, example restatement, and missing graph edges |
| test release readiness | `bun run validate:release && bun run check:upgrade -- --release` | Exercises strict validation path |
| rebuild end-user artifacts | `bun run bookkit build bad-people && bun run export:gitbook -- --book bad-people` | Ensures compile + export surfaces stay healthy |
| run all quality gates | `bun run lint && bun run check:types && bun run test && bun run validate` | Full CI-equivalent local check |

---

## Developer decision guide

When deciding where to implement a change, use this quick rubric:

| Change intent | Correct layer | Example |
| --- | --- | --- |
| alter pedagogical strategy or constraints for one title | `apps/<book>/src/book.config.ts` | changing chapter prerequisite policy for one book |
| enforce structure or validation across all books | `packages/astro-bookkit/**` | requiring a frame section for every mechanism |
| update examples, chapter prose, or glossary entries | `apps/<book>/src/content/book/**` | swapping case studies without changing mechanism meaning |

If your first instinct is “just special-case this one book,” stop and re-evaluate. The intended alternatives are: new engine capability, or explicit configuration at the book layer.

---

## Troubleshooting and diagnostics

### Validation fails but content "looks right"

- Re-check required frame sections (headings/fields must be structurally present, not implied in prose).
- Run `bun run validate:release` to see stricter failure output.
- Fix the failing record rather than relaxing validator strictness.

### Build passes but outputs feel semantically off

- Run `bun run check:concepts` and review glossary/mechanism drift.
- Confirm example edits did not mutate mechanism definitions.
- Re-run `bun run compile:book -- --book bad-people --mode error --no-drafts` to catch hidden assumptions.

### Unsure whether a change is risky

Use this rule of thumb:

- **Low risk:** content edits, copy changes, presentational styling.
- **Medium risk:** mechanism/tool definitions and boundaries.
- **High risk:** schemas, validators, frames, compiler ordering.

For medium/high risk changes, add a short before/after behavior note in your commit/PR.

---

## How compile-time governance works

Bookkit uses validation + frame enforcement to prevent drift:

```txt
content + book.config.ts
        │
        ▼
schema validation
        │
        ▼
frame checks + ordering constraints
        │
        ▼
compiler outputs (read UI, APIs, exports)
```

Validation should fail with **actionable errors** (what failed, where, and how to fix).

---

## Create a new book

Use the scaffold command (defaults to template `bad-people`):

```bash
bun run new:book -- --book <new-book> --title "Your Book Title"
```

Then:

1. Update `apps/<new-book>/src/book.config.ts`.
2. Replace starter content under `src/content/book/**`.
3. Run `bun run validate` and `bun run validate:release`.
4. Run `bun run bookkit dev <new-book>` to iterate locally.

Do not fork the engine to customize one book.

To remove a scaffolded book app:

```bash
bun run remove:book -- --book <book-slug>
```

---

## Contribution model

- Content edits and examples are welcome.
- Engine/frame/schema changes are higher-risk and require tighter review.
- If you touch validation behavior, keep errors actionable and document migration impact.

See detailed lanes/checklists in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## License

This project is dedicated to the public domain under [CC0 1.0 Universal](./LICENSE).
