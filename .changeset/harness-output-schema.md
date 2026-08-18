---
'@tanstack/ai': minor
'@tanstack/ai-claude-code': minor
'@tanstack/ai-codex': minor
'@tanstack/ai-opencode': minor
'@tanstack/ai-grok-build': minor
'@tanstack/ai-acp': minor
---

Harness adapters honor `chat({ outputSchema })` on the same turn.

Claude Code and Codex pass a native schema flag. OpenCode, Grok Build, and `acpCompatible` parse JSON from the final assistant text. The engine reads a `structured-output.complete` event so harness prose is not parsed as JSON.
