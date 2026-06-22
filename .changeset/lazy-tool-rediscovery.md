---
'@tanstack/ai': patch
---

fix: don't error when an already-discovered lazy tool's discovery is re-requested

Lazy tools use progressive disclosure: a synthetic `__lazy__tool__discovery__`
tool is advertised so the model can reveal a lazy tool's schema on demand. Once
**every** lazy tool has been discovered, that discovery tool is (intentionally)
dropped from the set advertised to the model to save tokens. But if the model
then re-requested discovery anyway — common in long-context or when it overlooks
that a tool is already available — the call fell through to tool execution and
came back as `Unknown tool: __lazy__tool__discovery__`.

The discovery tool is now kept _executable_ for the turn whenever a pending call
references it, even after it leaves the advertised set, so re-discovery returns
the schemas again instead of erroring. The advertised set is unchanged. The
discovery tool is also now idempotent — re-requesting an already-discovered tool
returns its schema without triggering a redundant tool-list refresh.

Additionally, `DISCOVERY_TOOL_NAME` is now exported from `@tanstack/ai` so custom
message-compaction / history-trimming logic can reference the discovery tool by
constant instead of hard-coding the string.
