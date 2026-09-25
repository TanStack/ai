---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
---

Preserve structured outcomes for cancelled and denied tool results. A `tool-result` part now carries `outcome: 'cancelled' | 'denied'` (new `ToolResultOutcome` type and `isToolResultOutcome` guard) across tool execution, streaming, persistence, and UI restoration, so callers can tell a user or middleware decision from an ordinary tool failure without matching error text. `state` stays `'error'` for these results. The `@tanstack/ai-client` `ToolResultPart` type (used by `useChat` messages) now has the same `outcome` field.
