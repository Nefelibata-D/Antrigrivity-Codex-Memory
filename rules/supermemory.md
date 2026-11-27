# Global Hybrid Memory Policy (Codex v2 + Supermemory)

You operate with a two-layer memory system:
1. **Local Hot Memory (`SessionStart` injected `MEMORY_SUMMARY` + `rollout_summaries/`)**: automatically injected at session start from `C:\Users\dzc\.gemini\config\memories\global\memory_summary.md` and `projects\<repo-lowercase>\memory_summary.md`.
2. **Cloud Long-Tail Memory (`supermemory` MCP)**: stores distilled durable facts across sessions and projects for semantic search and profile synthesis.

## 1. Reading & Applying Memory (Read Path)
- **Use the injected `MEMORY_SUMMARY` first**: apply the user's actual preferences, corrections, decisions, and supported task scope directly without redundant lookups.
- **Read local rollout details selectively**: when an entry in `## What's in Memory` lists a matching `rollout_summaries/<file>.md` whose additional evidence, chronology, or exact commands/paths could change your answer, inspect it via `read_file`. Do **not** read historical files speculatively.
- **Use `supermemory` MCP for long-tail or missing routes**:
  - Call `supermemory` → `search_memory` (passing `namespace: "<repo-lowercase>"` for project context, omitting `namespace` for global context) when the injected `MEMORY_SUMMARY` is empty/missing, when the user asks about older history not in `## What's in Memory`, or when switching to a distinct historical topic.
  - Omit `conversation_id` on your first `supermemory` call of the session, capture the returned `conversation_id`, and reuse it for all subsequent `supermemory` calls. Never issue parallel `supermemory` calls before receiving `conversation_id`.
- **Memory is not proof of current behavior**: for consequential or changeable code/config claims, verify against actual source files and acknowledge material uncertainty.

## 2. Writing & Updating Memory (Write Path)
- **Background pipeline handles routine extraction**: `Stop` hooks and the nightly/catch-up `codex-memory-pipeline` automatically distill conversation transcripts into `rollout_summaries/`, `memory_summary.md`, and `supermemory`. You do **not** need to log routine chatter during a turn.
- **Immediate write on explicit or high-signal events**:
  - When the user explicitly asks to **remember, forget, or correct** something, immediately:
    1. Append a short timestamped Markdown note under `C:\Users\dzc\.gemini\config\memories\projects\<repo-lowercase>\ad_hoc_notes\` (or `global\ad_hoc_notes\` for global preferences). Do **not** edit generated `memory_summary.md` directly—Phase 2 consolidation applies these notes.
    2. Sync the change to `supermemory` via `add_memory` (or `search_memory` + `forget_memory` + `add_memory` when superseding/forgetting).
  - Before finishing a turn where a clear durable preference, architecture decision, or non-obvious root cause was confirmed, you may also silently save a concise factual statement via `supermemory.add_memory`.

## 3. Space & Hygiene Rules
- Use `<repo-lowercase>` (matching the workspace folder name, e.g. `cashbook`) for project memories and omit `namespace` for global preferences. Do not call `select-space` unless asked.
- Never save secrets, API keys, passwords, tokens, credentials, or sensitive personal/financial records.
- Never duplicate permanent repository rules already documented in `AGENTS.md` or `GEMINI.md`.
