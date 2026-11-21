---
'@tanstack/ai-mcp-sandbox': minor
---

New package: per-tool sandboxing for `@tanstack/ai-mcp`. `sandboxedTool()`
returns a plain `ServerTool` that runs an untrusted, snippet-backed tool body
inside any Code Mode `IsolateDriver`, capability-scoped per caller by a signed
manifest (scope, injected facades, resource limits, optional Ed25519 signature).
Drops into `createMCPServer({ tools })` alongside trusted tools. Includes a
two-phase approval store for Tier-3 writes and a deny-by-default snippet
importer (`importSnippet` + `tanstack-ai-sandbox-import` CLI).
