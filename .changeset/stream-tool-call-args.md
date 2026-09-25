---
'@tanstack/ai-claude-code': minor
---

Stream Claude Code tool-call arguments incrementally from the SDK's partial
`tool_use` events. Structured output routed through a tool call can now render as
its JSON arrives instead of appearing only after the complete message.
