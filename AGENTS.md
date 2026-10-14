# AGENTS.md - Lean Universal Agent Master Router

> Universal specification for Claude Code, Gemini Antigravity, OpenAI Codex, and Cursor.
> Designed for progressive disclosure (<350 tokens) to prevent context bloat.

---

## 1. Progressive Disclosure Router (Load On-Demand Only)
Match the user's prompt to this table, announce `[Rule: <Name>]` at the start of your response, and load the modular rule only when triggered:

| Trigger Keywords in Prompt | Rule Tag to Announce | Modular Rule File to Load |
|---|---|---|
| plan, spec, ambiguous, vague, scope, interview | `[Rule: Core Behavior]` | `C:/Users/tejas/.agent-rules/core-behavior.md` |
| research, scrape, website, URL, docs | `[Rule: Stealth Scraper]` | `C:/Users/tejas/.agent-rules/stealth-scraper.md` |
| code, refactor, function, build logic | `[Rule: Ponytail]` | `C:/Users/tejas/.agent-rules/ponytail-minimalism.md` |
| ui, frontend, css, styling, dashboard | `[Rule: Taste & UI]` | `C:/Users/tejas/.agent-rules/taste-ui.md` |
| context, pack, codebase overview | `[Rule: Repomix Context]` | `C:/Users/tejas/.agent-rules/repomix-context.md` |
| task, sprint, progress, next steps | `[Rule: State Persistence]` | `C:/Users/tejas/.agent-rules/state-persistence.md` |
| proxy, api, model, quota, gateway | `[Rule: Free-Tier Routing]` | `C:/Users/tejas/.agent-rules/free-routing.md` |
| eval, test, benchmark, verify | `[Rule: Evals & Verification]` | `C:/Users/tejas/.agent-rules/evals-verification.md` |
| taxonomy, graph, ontology, schema | `[Rule: Semantic Taxonomy]` | `C:/Users/tejas/.agent-rules/semantic-taxonomy.md` |
| chunk, slice, handoff, relay, resume | `[Rule: Chunked Execution]` | `C:/Users/tejas/.agent-rules/chunked-execution.md` |

---

## 2. Operational Guardrails
1. **NO EM DASHES**: Never use em dashes (Unicode U+2014 or entity). Use ASCII hyphen `-` or colon `:` only.
2. **NEVER Commit or Read Secrets**: Never track `.env`/keys or read `Second Brain/99_PRIVATE/` or `n8n-recovery-codes.txt`.
3. **Follow the Trail**: Resolve file pointers, imports, and references directly without waiting to be handed paths.
4. **Surgical Scope Discipline**: Touch only what was requested. Never modify orthogonal files or adjacent folders without authorization (`[Rule: Core Behavior]`).
5. **Stop on Ambiguity & Intent Interviewing**: When requirements conflict, are vague, or are underspecified, STOP. Ask one focused question at a time with a best guess attached and confirm "Out of scope" before building (`[Rule: Core Behavior]`).
6. **Honest Pushback & Context Budget**: Point out flaws/regressions directly with cleaner alternatives (no sycophancy). Compress context before dropping; keep active task state last (`[Rule: Core Behavior]`).

---

## 3. First-Instinct Continuity & Resumption Protocol
1. **Auto-Bootstrap**: Ensure Memory Quad (`task.md`, `AUDIT_LOG.md`, `ARCHITECTURE.md`, `LEARNINGS.md`) exists before writing code.
2. **Auto-Resume**: Read `task.md` and `AUDIT_LOG.md` first on every session. Pick up active `[/]` or next `[ ]` slice. Never redo completed `[x]` work.
3. **1-Slice Execution**: Decompose into small vertical slices. Code, verify (`python evals/eval_runner.py`), check `task.md`, and log 3 lines to `AUDIT_LOG.md` per slice.
