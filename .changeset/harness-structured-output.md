---
'@tanstack/ai-codex': minor
'@tanstack/ai-claude-code': minor
'@tanstack/ai-opencode': minor
'@tanstack/ai-grok-build': patch
---

feat: honor `outputSchema` in the CLI harness adapters that support it natively. `chat({ outputSchema })` now works with the Codex (`codex exec --output-schema`), Claude Code (`claude -p --json-schema`), and OpenCode (`json_schema` output format) harnesses — the schema-constrained answer is produced within the single harness run and harvested by the engine (via `supportsCombinedToolsAndSchema`), with no separate finalization round-trip. The Codex harness throws when `tools` and `outputSchema` are combined, because Codex silently drops the schema when MCP/tools are active (openai/codex#15451). The Grok Build harness now rejects `outputSchema` with an accurate message (the grok CLI has no schema mechanism).
