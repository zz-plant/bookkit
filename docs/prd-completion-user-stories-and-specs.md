# PRD — Completion user stories and specs (engine hardening + UX polish)

Date: 2026-02-15

This PRD translates the open completion gaps from `docs/priority-agent-features.md` into implementation-ready user stories and specs.

---

## 1) Expand MCP resources for governance + operations docs

### User stories
- As an AI contributor, I want to fetch architecture and workflow policy through MCP resources so I can follow repo rules without broad file-system scans.
- As a maintainer, I want governance docs exposed read-only through MCP so agents get consistent policy context.

### Product scope
- Add canonical governance/ops documents to MCP `resources/list` output.
- Support `resources/read` for those URIs with stable identifiers.
- Keep resources read-only and deterministic.

### Functional requirements
1. MCP resource list includes at least:
   - `README.md`
   - `CONTRIBUTING.md`
   - `AGENTS.md`
   - command reference entry sourced from root scripts metadata.
2. Each resource item includes a stable URI, title, mime type, and optional description.
3. `resources/read` returns exact file content for listed URIs.
4. Errors must be actionable (resource not found, invalid URI).

### Non-functional requirements
- No write operations.
- Read latency target: <200 ms median for local docs.
- Resource URIs must stay stable across patch releases.

### Acceptance criteria
- Given a running app MCP endpoint, when calling `resources/list`, governance docs appear in results.
- Given a listed URI, when calling `resources/read`, full file text is returned.
- Given an unknown URI, endpoint returns structured error with remediation text.

---

## 2) Add deterministic, read-mostly MCP tools

### User stories
- As an agent, I want narrow deterministic tools for common checks so I can avoid ad-hoc shell usage.
- As a reviewer, I want tool calls to be auditable and bounded in scope.

### Product scope
- Add safe tool wrappers over existing scripts for inventory and validation.

### Functional requirements
1. Implement tools:
   - `bookkit.list_books`
   - `bookkit.validate_book(book)`
   - `bookkit.check_separation()`
   - `bookkit.list_mechanisms(book)`
2. Tool responses are structured JSON with `ok`, `summary`, and machine-readable payload.
3. Tool errors include cause + next action (e.g., bad book slug, validation failure path).
4. Tools are side-effect minimal (read-only except validation outputs/logging already used by scripts).

### Non-functional requirements
- Deterministic response shape.
- Max execution time budget: 60s per tool call.
- No arbitrary command execution.

### Acceptance criteria
- Tool discovery lists all four tools with schemas.
- Calling each tool with valid inputs returns `ok: true` and structured payload.
- Invalid inputs return `ok: false` with actionable guidance.

---

## 3) Add repository-native lane skills

### User stories
- As an AI contributor, I want explicit lane skills (content, engine, release) so I can run the right checks for each change class.
- As a maintainer, I want skill guidance to reinforce separation-of-concerns boundaries.

### Product scope
- Add local skill definitions under `.codex/skills/**` for:
  - Content edit lane
  - Engine/schema/validator lane
  - Release lane

### Functional requirements
1. Each lane skill includes:
   - when to use
   - allowed file paths
   - required checks
   - risk-level guidance
   - PR note template.
2. Lane skill instructions map to CONTRIBUTING verification matrix.
3. Release lane includes validation-release and upgrade-check requirements.

### Non-functional requirements
- Skills are concise and non-duplicative (link to canonical docs).
- No contradictory policy with AGENTS/CONTRIBUTING.

### Acceptance criteria
- Skills are discoverable via `bookkit.list_skills`/MCP resource scan.
- For each lane, instructions include explicit command checklist.
- Reviewer can trace lane guidance back to canonical docs.

---

## 4) Reduce first-run navigation overload

### User stories
- As a first-time reader, I want one obvious “start here” action so I can begin quickly.
- As a returning reader, I want advanced controls available but not overwhelming.

### Product scope
- Rebalance read landing and layout hierarchy for first-action clarity.

### Functional requirements
1. Reading hub shows a single primary CTA (“Start reading”).
2. Secondary utilities (versions, locale, diagnostics, advanced tools) use progressive disclosure.
3. Default route emphasizes reader workflow before author tooling.
4. Mobile and desktop retain equivalent “start reading” affordance.

### Non-functional requirements
- No regression in existing navigation reachability.
- Maintain keyboard accessibility for nav controls.

### Acceptance criteria
- UX test: first-time user can identify first action within 5 seconds.
- CTA appears above fold on common mobile/desktop breakpoints.
- Existing key routes remain reachable within <=2 interactions from hub.

---

## 5) Clarify exports/downloads vs diagnostics semantics

### User stories
- As a reader, I want export/download actions in a clear location so I can get offline formats quickly.
- As an author, I want diagnostics grouped under explicit author context.

### Product scope
- Separate reader-facing exports UX from author diagnostics routes.

### Functional requirements
1. Add or standardize a dedicated exports/downloads surface.
2. Move diagnostics links behind explicit author context labels.
3. Update route labels and IA copy to reduce ambiguity.
4. Preserve backward compatibility (redirects) for renamed routes.

### Non-functional requirements
- Zero broken internal links after route updates.
- Track route usage shifts via analytics events.

### Acceptance criteria
- Reader task: find and download PDF in <=2 interactions.
- Diagnostics pages are not presented as primary reader navigation.
- Legacy routes return 301/308 redirect or equivalent compatibility behavior.

---

## 6) Add citation-ready MCP resource chunking

### User stories
- As an agent, I want section/range reads so I can cite specific policy passages.
- As a reviewer, I want stable chunk identifiers for deterministic references.

### Product scope
- Extend MCP read model to support chunked document retrieval.

### Functional requirements
1. Add optional read parameters for section or line range.
2. Return chunk metadata including stable chunk ID and source range.
3. Preserve full-document read behavior for backward compatibility.
4. Emit validation errors for invalid ranges/sections.

### Non-functional requirements
- Chunk IDs remain stable unless source text changes in that chunk.
- Added parameters are optional and non-breaking.

### Acceptance criteria
- Agent can request a defined range and receive bounded text + chunk metadata.
- Same input returns same chunk ID across repeated reads.
- Existing clients without chunk params continue to work unchanged.

---

## 7) Add section-level change detection for “updated” labels

### User stories
- As a reader, I want “updated” labels that reflect real section changes, not coarse release timestamps.
- As an author, I want objective change metadata to drive updated-only filters.

### Product scope
- Compute and persist section-level diff metadata from release artifacts.

### Functional requirements
1. Build diff pipeline comparing prior and current release content at section granularity.
2. Store section change metadata with timestamp/version provenance.
3. Drive “updated” chips/filters from computed metadata, not manual tags.
4. Expose change metadata to relevant read surfaces.

### Non-functional requirements
- Diff computation should complete within existing release build budget.
- Deterministic results for same inputs.

### Acceptance criteria
- When a section changes between releases, that section is marked updated.
- Unchanged sections do not receive updated labels.
- Updated-only filters show exactly sections marked by diff metadata.

---

## Delivery sequence and dependencies

1. MCP governance resources (foundation)
2. Deterministic MCP tools
3. Lane skills
4. Navigation-first-run UX
5. Route semantics cleanup
6. Citation chunking
7. Section-level change detection

Dependencies:
- (2) builds on MCP endpoint/tooling contracts.
- (3) depends on agreed command/tool conventions.
- (6) builds on MCP resource model introduced in (1).
- (7) depends on release artifact consistency.

## Release readiness checklist for this PRD

- [ ] Each scoped initiative has owner + milestone.
- [ ] Engine-facing work has migration/error messaging notes where relevant.
- [ ] UX items include measurable task-completion checks.
- [ ] MCP items include backward-compatibility tests.
