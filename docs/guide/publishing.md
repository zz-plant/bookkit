# Publishing

## Publish

`bun run bookkit publish [book]` moves a book from draft to published. It checks the book with the rules a published book is held to (no draft records, no broken links, a public `site.url`, no starter text in `book.config.ts`), and only when nothing fails sets `status: "published"` in `book.config.ts`. `--dry-run` checks and changes nothing. A book whose records were left `status: draft` while they were written can take `--records`, which marks every draft record published first, and puts them back if the book still fails. It then names the next steps: a first release note, and `deploy`.

## Deploy

Every book builds to a static site and publishes to [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/). For deploy, a book is a folder in `apps/` with `src/book.config.ts` and `wrangler.jsonc` (Worker name `bookkit-<slug>`, `dist/` as the assets folder, the 404 page for misses, and URLs without trailing slashes).

`bun run bookkit deploy [book...]` publishes all or none:

1. `verify --all` (without its build of every book), so content errors in any book stop the run; a `--dry-run` leaves out the engine's tests and type check too, which take most of the time and concern code an author does not change (`--dry-run --full` runs them);
2. a build of each selected book and `check:build` on its `dist/`;
3. for a book on a custom domain, a comparison with the live page count (`--allow-page-drop` publishes when more than a quarter of the pages would disappear);
4. `wrangler deploy` for each book, or wrangler's dry run with `--dry-run`.

Refusals are listed in a summary with their reasons, and nothing is published unless every book passed. If wrangler then fails for one book, the books already published stay up. Each Worker version's message is `<sha12> <subject>` of the commit.

- **Uncommitted changes** in the selected books, or outside `apps/`, refuse a real deploy; `--allow-dirty` publishes anyway and says so in the version message. `--dry-run` rehearses uncommitted work and exits 0 when it passes.
- **`--no-build`** publishes the `dist/` an earlier deploy run built, checked, and stamped (in `apps/<book>/.bookkit/deploy-stamp.json`) at the current commit: a real deploy, or a `--dry-run --full` of committed work. It refuses a missing, stale, or edited `dist/`; `bookkit build` does not stamp.
- **No book named** means the current book (`bookkit use`), else every book; `--all`, or `bun run deploy`, means every book. Unknown flags exit 1.

The `*.workers.dev` address works at once and is `noindex` (`public/_headers`). For your own domain, set `site.url` to it and add `"routes": [{ "pattern": "<domain>", "custom_domain": true }]` to the book's `wrangler.jsonc`; the next deploy attaches the domain, whose zone must be on your Cloudflare account.

## Deploy from CI

`.github/workflows/deploy.yml` publishes after CI passes on a push to `main`, or when run by hand on `main`. It is off until you turn it on:

1. Set the repository variable `DEPLOY_BOOKS` (Settings → Secrets and variables → Actions → Variables) to the books to publish, separated by spaces, or to `--all`.
2. Add the `CLOUDFLARE_API_TOKEN` secret, and `CLOUDFLARE_ACCOUNT_ID` if the token can see more than one account.

With no `DEPLOY_BOOKS` the job is skipped; with `DEPLOY_BOOKS` and no token it fails. The token is visible only to the publish step, which runs `--no-build` on what the job's dry run checked. A run for a commit that `main` has moved past publishes nothing. Forks do not inherit the variable, so a fork publishes only what its own `DEPLOY_BOOKS` names.

## Static and server builds

With `site.runtime` unset or `"static"`, the build serves the reader site, search, the exports, the sitemap, `robots.txt`, RSS, link-preview images, the MCP manifest (`GET /api/mcp.json`), and the `_headers` rules. Routes that need a request handler (feedback, analytics, the Ask panel, release webhooks and email, MCP tool calls) get no file in `dist/`, so they 404, and pages leave out the feedback widget, the Ask panel and its in-browser models, analytics beacons, and the language and version switchers.

`previewAccess` cannot protect static files, because Astro prerenders the pages; protect drafts at the edge (for example Cloudflare Access) instead.

## Server runtime

`site.runtime: "server"` runs the `/api/*` routes on demand while pages stay prerendered. It needs an Astro adapter in `astro.config.mjs` (for example `@astrojs/node`); a build without one stops and says so. The bundled `wrangler.jsonc` serves static assets only, so `bookkit deploy` does not run these routes.

The server reads its environment:

| Variable | Effect |
| --- | --- |
| `BOOKKIT_AUTHOR_TOKEN` | Required. 32 or more random characters (`openssl rand -hex 32`), sent as `Authorization: Bearer <token>`. It gates the release webhook and email routes (under `bookkit dev` too), the analytics, feedback, and preview-analytics reads, and MCP `tools/call`; the reads and tool calls are open under `bookkit dev`. Without it these answer 500 and the server log says why; a wrong token gets 401. |
| `BOOKKIT_DATA_DIR` | Where the server keeps what readers send; see [Where data lives](./concepts.md#where-data-lives). |
| `BOOKKIT_RELEASE_WEBHOOKS`, `BOOKKIT_RELEASE_EMAIL_TARGETS` | Delivery targets for release notifications, as JSON arrays or comma-separated URLs ([`releases/README.md`](../../packages/astro-bookkit/src/releases/README.md)). |
| `OPENAI_API_KEY`, `GROQ_API_KEY` | The Ask panel's answers: OpenAI (`gpt-4o-mini`) first, Groq (`llama-3.1-8b-instant`) as the fallback. With neither, `/api/qa.json` answers 503. |

```sh
curl -X POST -H "Authorization: Bearer $BOOKKIT_AUTHOR_TOKEN" https://<site>/api/release-webhook.json
```

Reader routes refuse a body over their limit (413) and more requests per minute from one client address than their limit (429); Q&A also caps a server process at 60 questions a minute. Behind a proxy, the adapter must report each reader's address, or every reader shares one limit. On `/read/analytics`, enter the author token once to see what readers sent; the browser keeps it per book and the same panel forgets it.
