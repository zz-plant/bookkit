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

## Bets

Status on 2026-10-07: the author picked **B1, now active**. **B2 is parked**: no build starts on it until B1's test produces a result or the author reopens it. B2's public-corpus dry run stays allowed as a read-only probe that writes nothing to the repo.

### B1: One argument, three drafts (active since 2026-10-07)

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
| `killBy` | 2026-11-04, four weeks after the merge pass. If it has not changed how the author writes, drop the registry and stay per-book. |

#### B1 log

- **2026-10-07, picked.** First build step shipped: `bun run check:corpus` runs the overlap check across books, adding a semantic pass (all-MiniLM-L6-v2, local, threshold 0.45) to the lexical one.
- **2026-10-07, first run.** Over the three nonfiction books it finds 6 clusters covering 19 of 33 mechanisms; folding every cluster would leave 20. The lexical pass alone flags one of the 14 pairs. Strongest pair: `bad-people/coercive-waiting` ~ `running-hot/delay-as-force` (0.70). The runbook book clusters with nothing. Next: the author's merge pass, cluster by cluster.
- **2026-10-07, merge pass.** The author's rule: combine mechanisms that are the same idea. Judged by whether two mechanisms share both the lever and the evidence, only one pair qualified. `bad-people/coercive-waiting` and `running-hot/delay-as-force` became one mechanism, `delay-as-force`, with an identical contract in both books. The other 13 flagged pairs were ruled distinct, each with a reason in `corpus.json` (mostly cause versus effect, or before-harm versus after-harm). `check:corpus --mode error` now passes: 32 mechanisms, 1 shared, 0 unresolved.
- **Prediction failed:** the merge pass removed 1 of 33 mechanisms (3%), not a third. The books overlap in *families* of related mechanisms (time, reversibility, gatekeeping, moral cover), not in duplicates. Open question for the author: the three books' central mechanisms (`transfer-success`, `human-heat-sink`, `crumple-zone`) read as one idea in three metaphors but score 0.35–0.40, below the 0.45 threshold. Combining them decides whether these are three books or one, so they were left alone.
- **2026-10-07, central mechanisms.** The author asked for the open question to be decided. `running-hot/human-heat-sink` and `crumple-zone/crumple-zone` are the same idea under the same test: institutions stay stable by routing shocks into people instead of building buffers, and you check it by asking who absorbs the load when there is no backup. They are now one mechanism, `crumple-zone`, shared by both books; Running Hot keeps "human heat sink" as its name in prose and as a glossary alias. All three books already used the idea in their glossaries (Bad People's "human crumple zones"). `bad-people/transfer-success` stays distinct: its lever is authority (decision rights stay up while blame and cost move down), and it is tested by comparing who decided with who pays. The corpus is now 31 mechanisms, 2 shared, 0 unresolved.
- **Still to test:** the next three chapters introduce at most one new mechanism between them; five outside readers finish one book.

### B2: Runbooks that fail the PR (parked)

| Field | Value |
| --- | --- |
| `user` | An on-call or ops lead who owns runbooks in a wiki or repo today. None identified yet; find three. |
| `claim` | "Your runbooks rot silently. Bookkit fails the PR when a procedure loses its owner, drill, or escalation, and tells you which controls lost coverage." |
| `surface` | CI output and the PR check, not the reader site. |
| `build` | Nothing new before the test. Run `bookkit import`, `propose`, and `check:runbooks:error` (warn mode exits 0, so only error mode fails a PR) on real runbooks, starting with a public corpus as a dry run. |
| `is` | Import fidelity on messy real runbooks; clarity of CI output. |
| `isNot` | Reader UI, compliance certification, MCP hardening, a hosted platform. |
| `prediction` | A real runbook folder becomes a passing runbook-frame book in under an hour of author time, and at least one of three owners wants the check in their CI. |
| `test` | Three conversations and three real corpora through the pipeline, recording where it breaks. |
| `killBy` | If none of the three would add it to CI, park the runbook wedge. The frame stays; it costs nothing to keep. |

B2's test needs conversations only the author can have; the public-corpus dry run (the exception above) can happen in the meantime.

---

## Parked until a bet's test calls for it

- Reader UI and UX passes, including the open UX items in `apps/*/TODOS.md`. The 2026-10-07 typography pass was done at the author's request; follow-ups wait for B1's outside-reader test and go through `.codex/skills/reader-typography/SKILL.md`.
- New PRDs, audits, and UI critiques
- MCP discovery and governance-API hardening (commercial roadmap Tracks 2 and 3)
- Reader forking (Track 4)
- New proof books and new frames

The audits, critiques, PRDs, and research notes listed here as archive candidates were removed on 2026-10-07 (65 files; see `CHANGELOG.md`). They remain in git history at `2ca1b3e`.

## Updating this document

Revise it when a bet's test produces a result, when a bet hits `killBy`, or when the binding corner changes. Record what was observed, not what was built.
