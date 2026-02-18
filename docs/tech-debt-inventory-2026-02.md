# Tech debt inventory (2026-02)

This is a quick inventory of current maintenance debt observed in the repository.

See also: `docs/tech-debt-register.md` for owner/milestone/status tracking.

## 1) Backlog fidelity drift in book TODO trackers (medium)

- The previous scaffold drift issue (`apps/running-hot/TODOS.md` titled **"Bad People — TODOs"**) has been corrected.
- Follow-through work remains: TODO files now use active-backlog format, but they still need owner + milestone metadata to stay operational.

**Why this is debt**

- Contributors cannot trust TODO docs as active backlog state unless ownership and timing are explicit.
- Backlog docs degrade quickly when completed checklists are never archived.

**Current status / next fix**

- ✅ TODO files normalized to open-work format.
- 🔜 Add owner + milestone tags for each open item and archive completed work into release notes/changelog docs.

## 2) Documentation drift between architecture examples and active workspace (low)

- The README repo layout example now includes both `bad-people` and `running-hot`.
- A source-of-truth note (`bun run list:books`) has been added, reducing future drift risk.

**Why this is debt**

- Architecture docs require periodic synchronization with executable workspace state.

**Current status / next fix**

- ✅ Layout snippet and source-of-truth note are updated.
- 🔜 Keep this in docs review checklist for future book additions/removals.

## 3) Audit proliferation without an owner-facing consolidation point (medium)

- There are multiple audits and critiques (UX audits, route audits, feature audits, SEO audits, user journey critiques) spread across `docs/` and `apps/*/specs/`.

**Why this is debt**

- Findings are fragmented; there is no single prioritized queue for remediation.
- Repeated observations can persist across docs without closure signals.

**Current status / next fix**

- ✅ Central register created at `docs/tech-debt-register.md`.
- 🔜 Link each audit doc's open items back to register rows to make closure visible.

## 4) Validation hygiene is manually enforced, not automation-enforced (medium)

- The workspace has strong validation commands (`validate`, `check:separation`, `check:concepts`) but no visible CI policy in this repository segment to guarantee they run on every change.

**Why this is debt**

- Governance guarantees rely on contributor discipline instead of mandatory automation.
- Risky schema/frame/compiler changes could regress if checks are skipped locally.

**Suggested fix**

- Add CI workflow gates for `bun run validate`, `bun run check:separation`, and `bun run check:types`.
- Consider a fast pre-push lane that runs at least `validate:book` for touched books.

## Suggested execution order

1. Backlog fidelity cleanup (`TODOS.md` normalization). ✅
2. Add central debt register and link existing audits. 🟡 Register done; audit back-links pending.
3. Tighten CI checks for governance commands.
4. README layout synchronization. ✅
