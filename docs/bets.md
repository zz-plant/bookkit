# Bets: how we choose what to work on

Canonical for what gets worked on next and why. Invariants stay in [`AGENTS.md`](../AGENTS.md); structure stays in [`docs/architecture.md`](./architecture.md).

Until now, design, use cases, positioning, and technical possibilities each produced their own documents, and each was checked only against itself: code against gates, UI against generic audits, positioning against other docs, use cases against a proof book written to fit the engine. Nothing was checked against a person doing a real job. This document replaces that with one anchor and a contract per unit of work.

---

## The rule

1. **A use case is the anchor.** A bet starts from a real person doing a real job on real content. The author counts.
2. **Positioning is the claim made to that person**, in one sentence they could prove wrong.
3. **Design is the surface where that person meets the claim.** That may be a terminal report, a PR check, or a mechanism map, not the reader site.
4. **Technical possibility proposes; it never selects.** "Cheap to build" and "needs no auth" are not evidence anyone needs it.
5. **Work the binding corner only.** If nobody uses the output yet, more engine and more reader polish have close to zero value.

## Bet contract

Bets use the same shape as mechanisms, so they can be held to the same standard.

| Field | Meaning |
| --- | --- |
| `user` | Who, specifically. A role you can name a real person for, or the author. |
| `claim` | The one-sentence positioning, falsifiable. |
| `surface` | Where they experience it. |
| `build` | The smallest thing that makes the claim true on their content. |
| `is` / `isNot` | What work this bet covers, and what it explicitly excludes. |
| `prediction` | What we expect to observe if the claim is true. |
| `test` | How we observe it, against real content or a real person. |
| `killBy` | Date and condition for dropping or parking the bet. |

## Who spends effort on what

- **The author** (scarce, irreversible): picking the anchor, wording claims, merging or splitting mechanisms, writing, talking to prospective users.
- **Agents** (cheap, reversible): running a probe against the anchor before building anything, building the smallest thing a bet needs, keeping gates green, retiring stale docs.
- **Work that serves no active bet is maintenance.** Keep it small and do not open new audits, PRDs, or critique docs for it. Without an anchor, agent sessions default to work they can verify alone (audits, gates, polish), and each audit finds the next one.

---

## State on 2026-10-07

| Signal | Measurement |
| --- | --- |
| Book content | 16.6k words across four books. `running-hot`'s 16 chapters total about 2k words. |
| Writing about Bookkit | About 44k words of Markdown outside book content (docs, audits, PRDs, READMEs). |
| Engine | 24.7k lines. 10.5k (42%) is reader UI (`components`, `layouts`, `styles`); `schemas` + `frames` + `validators` are 1.0k. |
| Recent effort | 4 of the last 6 merged PRs (#227, #228, #231, #232) were reader-UI passes. |
| Readers | None outside the project: private repo, placeholder `.book` domains, no external issues. |
| Built but inert on the deploy target | Feedback, analytics, AI Q&A synthesis, release webhooks, MCP tool calls (README → Deploy). |
| Runbook proof book | Content written to demo the frame; its "overdue review" warnings come from fixture dates. |
| Positioning headlines in use | Five: "book compiler, not a CMS"; "compiler + governance + AI-interface platform"; "compiler for verifiable operating procedures"; "the book as software / reader as forker"; "AI may propose; the compiler decides". |
| Cross-book concept drift | 33 mechanisms across the three nonfiction books. Read side by side they form at least four clusters (below). `analyzeMechanismOverlap`, run over all 33 at once, flags **0** cross-book pairs even at threshold 0.15: it is lexical and runs one book at a time. |

Candidate clusters, for the author to judge:

- **Time as a weapon:** `bad-people/coercive-waiting`, `running-hot/delay-as-force`, `running-hot/attrition-by-queue`, `crumple-zone/temporal-capture`
- **Harm moved onto people:** `bad-people/transfer-success`, `crumple-zone/crumple-zone`, `running-hot/human-heat-sink`, `running-hot/obligation-without-custody`
- **Reversibility:** `bad-people/reversal-capacity`, `running-hot/reversibility-gap`
- **Access gated by proof or judgment:** `running-hot/documentation-tollbooth`, `running-hot/discretion-as-gate`, `crumple-zone/credibility-access-control`, `crumple-zone/clearance-culture`

**Binding corner: use case.** The only real user today is the author, and the engine's central promise (concepts cannot drift) does not hold on the author's own corpus.

---

## Candidate bets

Status: **proposed**. The author picks the anchor; agents do not start either build until then.

### B1: One argument, three drafts

| Field | Value |
| --- | --- |
| `user` | The author of `bad-people`, `running-hot`, and `crumple-zone`. |
| `claim` | "Your three drafts are one argument. Bookkit keeps its mechanisms stable and non-overlapping across all of them, so each book can be finished without re-deriving the thesis." |
| `surface` | A cross-book mechanism report in the terminal first. A page only if the report gets used. |
| `build` | Load mechanisms across books; add a semantic overlap pass next to the lexical one. Design a shared registry only after the author has merged clusters by hand. |
| `is` | Consolidating the 33 mechanisms; finishing one book to a readable draft. |
| `isNot` | Reader UI, new books, new frames, MCP work. |
| `prediction` | The merge pass removes a third or more of the mechanisms, and new chapters bind existing slugs instead of coining names. |
| `test` | The next three chapters drafted introduce at most one new mechanism between them; the cross-book check reports no unresolved duplicates; five people outside the project read one book end to end. |
| `killBy` | Four weeks after the merge pass. If it has not changed how the author writes, drop the registry and stay per-book. |

### B2: Runbooks that fail the PR

| Field | Value |
| --- | --- |
| `user` | An on-call or ops lead who owns runbooks in a wiki or repo today. None identified yet; find three. |
| `claim` | "Your runbooks rot silently. Bookkit fails the PR when a procedure loses its owner, drill, or escalation, and tells you which controls lost coverage." |
| `surface` | CI output and the PR check, not the reader site. |
| `build` | Nothing new before the test. Run `bookkit import`, `propose`, and `check:runbooks` on real runbooks, starting with a public corpus as a dry run. |
| `is` | Import fidelity on messy real runbooks; clarity of CI output. |
| `isNot` | Reader UI, compliance certification, MCP hardening, a hosted platform. |
| `prediction` | A real runbook folder becomes a passing runbook-frame book in under an hour of author time, and at least one of three owners wants the check in their CI. |
| `test` | Three conversations and three real corpora through the pipeline, recording where it breaks. |
| `killBy` | If none of the three would add it to CI, park the runbook wedge. The frame stays; it costs nothing to keep. |

B1 can start immediately because its user is already here. B2's test needs conversations only the author can have; agents can run the public-corpus dry run in the meantime.

---

## Parked until a bet's test calls for it

- Reader UI and UX passes, including the open UX items in `apps/*/TODOS.md`
- New PRDs, audits, and UI critiques
- MCP discovery and governance-API hardening (commercial roadmap Tracks 2 and 3)
- Reader forking (Track 4)
- New proof books and new frames

Candidates to archive once a bet is chosen: the `docs/ui-*` critiques, `docs/new-user-route-ux-critique.md`, `docs/priority-agent-features.md`, `docs/prd-completion-user-stories-and-specs.md`, `apps/bad-people/specs/prd-*.md`, and the root `UX_AUDIT.md`, `FRONTEND_INEFFICIENCIES.md`, `STACK_CAPABILITIES_RESEARCH.md`, `SCRATCHPAD.md`.

## Updating this document

Revise it when a bet's test produces a result, when a bet hits `killBy`, or when the binding corner changes. Record what was observed, not what was built.
