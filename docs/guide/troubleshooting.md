# Troubleshooting

**A published book fails with `DRAFT_IN_RELEASE`.** Some record still has `status: draft` (or none). Finish it and set its status, or move the book back to `in-review` until it is done.

**The book builds but search engines never see it.** Its status is not `published` or `stable`, or `site.indexable` is `false`, so every page is `noindex`. A `*.workers.dev` address is `noindex` regardless; publish on the domain in `site.url`.

**A chapter is missing from search and the sitemap.** It has fewer words of prose than `site.minIndexableWords` (default 60), so it counts as a stub. `bun run bookkit` lists the stubs.

**`bookkit check` says "semantic pass unavailable".** The embedding model is not downloaded, and there was no terminal to ask. Pass `--download-model`, set `BOOKKIT_DOWNLOAD_MODEL=1`, or use `--quick`.

**`check:build` refuses preview access.** `previewAccess.enabled` is `true` on a static build, where a token gate cannot protect prerendered files. Set it to `false`, or serve the book with the server runtime.

**Deploy refuses with "uncommitted changes".** Commit them, or rehearse with `--dry-run`. `--no-build` refuses a `dist/` that a deploy run did not stamp at the current commit; run `deploy <book> --dry-run --full` first.

**The build stops because the PDF cannot draw some characters.** The book uses a script the bundled fonts lack, or one that needs shaping. Set `exports.pdfFont` to a TTF or OTF font that covers it, or `exports: { pdf: false }`; the EPUB is not affected.

**A link renders as plain text.** Its address uses a scheme the link rule refuses (`UNSAFE_LINK`); `bookkit check` names the file and line.

**A tag, attribute, or `{expression}` is missing from the page.** The HTML allowlist removed it (`UNSAFE_HTML`). `bookkit check` names the line and says what to write instead, for example an `.svg` file shown as an image in place of inline `<svg>`.

**`bookkit dev` says the port is in use.** Another server holds it: `bun run bookkit dev status` finds one Bookkit started, or pass `--port <n>`.

**A semantic overlap appears after a model or threshold change.** Run `bun run check:corpus -- --eval` to score the models against the recorded rulings before you rule on the pair.

**`bookkit bets` says "not measured" because the clone is shallow.** Cloud sessions and CI clone with a short history, which stops after the bet started. Run `git fetch --unshallow origin` once, then `bun run bookkit bets` again. If git answers "error in object: unshallow" (a clone deepened earlier with `--shallow-since` or `--deepen`), clone again without `--depth`.
