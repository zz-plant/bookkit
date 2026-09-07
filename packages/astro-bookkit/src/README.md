# Engine source map

The module map lives in [`docs/architecture.md`](../../../docs/architecture.md) — one table naming every directory here, what it owns, and its import tier.

It is kept accurate by `bun run check:architecture`, which fails CI when a module is added, renamed, removed, or re-layered without the document being updated. That is why the map is not duplicated here: a second copy is a copy that drifts.

Two rules apply when working in this directory:

- **Imports point strictly down a tier.** Same-tier imports are legal only inside the two declared cycles. Anything else fails the gate.
- **Prefer general mechanisms over book-specific exceptions.** The engine never learns a book's name; variation belongs in `book.config.ts` or in a new engine capability.
