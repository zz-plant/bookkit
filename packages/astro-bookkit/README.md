# Astro Bookkit (Engine Package)

This package contains the reusable, book-agnostic compiler engine.

## What belongs here

- frames and structural requirements
- schemas and validation rules
- compiler/orchestration utilities
- shared components/styles reused by multiple books

## What does not belong here

- book-specific narrative content
- one-off behavior for a single title
- content-level hacks that should be modeled as schema/frame rules

## Canonical docs

- Architecture + commands: [`../../README.md`](../../README.md)
- Contribution workflow: [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)
- Invariants + guardrails: [`../../AGENTS.md`](../../AGENTS.md)

Keep this README local in scope; link outward for policy.

## App wrapper usage

Use `@bookkit/astro-bookkit` app wrapper helpers to keep page and API route bindings minimal in book apps while injecting book-specific config from the app layer.

```ts
import { createReleaseWebhookApiHandlers } from "@bookkit/astro-bookkit";
import bookConfig from "../book.config";
import { releaseModules } from "../lib/release-notes";

export const { POST } = createReleaseWebhookApiHandlers({
  modules: releaseModules,
  book: { slug: bookConfig.slug, title: bookConfig.title },
});
```
