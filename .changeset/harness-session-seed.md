---
'@tanstack/ai-harness': minor
---

Add `session.seed({ messages })`: it writes messages that exist already into an empty thread, so an app can bring its earlier conversations into the harness and the next turn reads them. A retry with the same messages is accepted and writes nothing. It refuses a thread with other messages (`not_empty`), two messages with the same id (`duplicate_message`, except the parts of one UI message split at its tool results), a tool call with no result (`open_tool_call`), a tool result with no call before it (`unknown_tool_call`), and a session that is not idle (`busy`). On a host with access, it needs the `send` action.
