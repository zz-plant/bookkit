# MCP + Agent Skills Research for Bookkit (2026-02-11)

## Why this research exists

Bookkit already exposes a minimal MCP endpoint for book content (`/api/mcp.json`) through `createBookMcpEndpoint`, with resource listing/reading and no tools yet. This creates a strong foundation for AI-assisted contributor workflows and browsing agents.

This note summarizes current practical patterns AI developers are using with **Model Context Protocol (MCP)** and **agent skills**, and proposes implementation options that fit Bookkit's architecture.

---

## How AI developers are using MCP right now

### 1) "Context adapters" over existing systems

Most teams start MCP by exposing existing data sources as resources:

- docs and handbooks
- issue trackers
- code search and symbols
- runbooks/playbooks
- analytics dashboards

Why it works:

- low risk (read-only first)
- immediate value for grounding models
- avoids custom prompt glue per tool

### 2) Small, deterministic tools instead of giant autonomous agents

Common successful MCP tool designs are narrow and explicit:

- `search_docs(query)`
- `run_test(target)`
- `create_issue(title, body)`
- `lookup_schema(name)`

Patterns:

- strict input schemas
- short execution time
- clear failure messages
- auditable logs

### 3) Permission tiering and environment scoping

Developers usually adopt a staged trust model:

1. read-only resources
2. safe write actions in dev/staging
3. production writes behind explicit approvals

This reduces blast radius while keeping high-utility operations available.

### 4) "Agent memory" as explicit resources, not hidden state

Instead of relying on long chat threads, teams publish durable artifacts as MCP resources:

- architecture decisions
- migration guides
- style guides
- known incident patterns

This improves repeatability across agents and sessions.

### 5) Multi-agent composition through shared protocol

A common stack is:

- one coding agent
- one browsing/research agent
- one verification/reviewer agent

They coordinate by reading the same MCP resources and invoking the same tools, rather than bespoke pairwise integrations.

---

## How AI developers are using agent skills right now

### 1) Skills as reusable operational playbooks

Agent skills are often used as versioned, task-specific runbooks:

- "create feature spec"
- "perform release cut"
- "triage failed CI"
- "add new content module"

The best skills encode checklists and guardrails, not just text snippets.

### 2) Skills for consistency in contributor lanes

Teams use skills to enforce lane-specific behavior:

- content contributor lane
- engine contributor lane
- release manager lane

This maps well to Bookkit's separation between content, config, and engine concerns.

### 3) Progressive disclosure inside skills

High-quality skills avoid loading all docs at once. They direct agents to:

- read one canonical file first
- load only task-relevant references
- run a minimal verification set

This keeps context windows focused and lowers hallucination risk.

### 4) "Skill + MCP" pairings

A strong emerging pattern is:

- skills define workflow and policy
- MCP provides live context and executable tools

This is often more reliable than either mechanism alone.

---

## Fit assessment for Bookkit

## Current strengths

- clear governance docs (`README`, `CONTRIBUTING`, `AGENTS`)
- strict architectural boundaries
- existing MCP endpoint plumbing in engine
- validation scripts that can be wrapped by tools

## Current gaps

- MCP tools are not implemented yet (`tools/list` is empty)
- no dedicated contributor/agent skills inside the repo
- no explicit "agent onboarding" flow for external browsing agents

---

## Recommended implementation options

## Option A (low-risk): Improve contributor productivity inside repo

### A1) Add read-optimized MCP resources for governance

Expose canonical docs as first-class MCP resources (in addition to content):

- architecture rules
- contribution workflow
- command catalog
- validation expectations

Outcome: agents stop re-deriving policy from scattered files.

### A2) Add a minimal safe tool set

Start with deterministic, read-mostly tools:

- `bookkit.list_books`
- `bookkit.validate_book(book)`
- `bookkit.check_separation()`
- `bookkit.list_mechanisms(book)`

Design constraints:

- <=10 minute runtime
- structured JSON results
- actionable errors matching existing CLI language

### A3) Add repo-local skills for common lanes

Create skills such as:

- **content-edit skill**: allowed files, frame checks, glossary/mechanism linkage checks
- **engine-change skill**: validator/tests/migration-note checklist
- **release skill**: validate + release notes + webhook smoke path

Each skill should explicitly mirror Bookkit invariants (especially strict separation of concerns).

## Option B (medium-risk): Improve web-browsing agent quality

### B1) Add "agent-friendly read API profile"

In addition to MCP JSON-RPC, expose a lightweight discovery response containing:

- available resource types
- rate limits
- safety flags (read-only vs mutating)
- recommended query patterns

This helps generic browsing agents self-configure quickly.

### B2) Add tool execution metadata

For each tool, publish:

- expected runtime
- side-effect level
- idempotency guarantees
- retry guidance

Browsing agents perform better when this metadata is machine-readable.

### B3) Add citation-ready resource chunks

Support optional chunked reads (e.g., section offsets) so agents can quote precise ranges when generating reports or PR summaries.

---

## Concrete phased plan for this repo

### Phase 0 (now)

- Document MCP + skills strategy (this file)
- Align maintainers on safe-first rollout and ownership

### Phase 1 (1-2 PRs)

- Extend MCP resources beyond content to governance docs
- Implement `tools/list` with at least 2 safe read-only tools
- Return structured errors with remediation hints

### Phase 2 (2-4 PRs)

- Add repo skills in a discoverable folder (`.codex/skills` or similar)
- Add lane-specific checklists linked to canonical docs
- Add CI check verifying skill docs point to existing commands/files

### Phase 3 (optional)

- Add guarded mutating tools (e.g., scaffolders) behind environment flags
- Add audit log output for tool calls
- Add "policy snapshot" resource versioning for reproducibility

---

## Suggested success metrics

Track before/after for AI-assisted contribution sessions:

- time-to-first-correct-change
- number of architecture-boundary violations caught in review
- validation failure rate per merged PR
- number of agent retries due to missing context
- PR cycle time for content-only changes

---

## Risk notes

- Keep engine changes generic; avoid book-specific MCP behavior.
- Do not weaken validators to improve agent pass rates.
- Any schema/validator changes should preserve actionable errors and include migration notes.

These recommendations are intentionally aligned with Bookkit's invariant that behavior belongs in engine/config, not content bindings.
