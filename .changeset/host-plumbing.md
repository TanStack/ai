---
'@tanstack/ai': minor
'@tanstack/ai-persistence': minor
---

New hooks for hosts that run `chat()` for a long session.

- `@tanstack/ai` exports `runAgentStream` (runs a `defineAgent` agent outside a parent chat turn), `createSubagentId`, `createSubagentSink`, `CapabilityRegistry`, and the `SubagentsBag` and `SubagentSink` types. Pass the sink to keep interrupt objects and token usage. The finished event has `interruptIds` only.
- `MetadataStore` has optional `getVersioned` and `setIf` for compare-and-set writes. The memory store of `@tanstack/ai-persistence` has both, and the conformance testkit checks them.
- `toolDefinition({ replay: 'safe' | 'never' })` tells a host if it can run the tool again after a crash.
- The tool context has an optional `detach` field. A host sets it when it can move the call to the background. A tool passes its work to `detach` and races the two promises.
- A tool that throws the MCP input-required shape can set the interrupt `reason`. The default is `'mcp_input'`. The interrupt id stays `mcp_input_<toolCallId>`.
