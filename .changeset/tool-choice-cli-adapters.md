---
'@tanstack/ai-acp': patch
'@tanstack/ai-claude-code': patch
'@tanstack/ai-codex': patch
'@tanstack/ai-grok-build': patch
'@tanstack/ai-opencode': patch
---

The CLI-style adapters follow `chat({ toolChoice })` where they can.

- **Claude Code.** `'none'` and a named tool turn off the built-in tools. The adapter then bridges none of your tools, or only the named one. `'required'` logs a warning.
- **Codex, OpenCode, Grok Build, and ACP-compatible adapters.** `'none'` and a named tool limit only your bridged tools. The built-in tools of the agent stay on, so these values and `'required'` log a warning.
