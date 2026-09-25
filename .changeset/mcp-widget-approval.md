---
'@tanstack/ai-mcp': patch
---

`createMcpAppCallHandler` now honors the client's `needsApproval`. A widget call
has no approval step, so a call to a tool that `needsApproval` marks returns
`{ ok: false, error: 'Tool needs approval: <name>' }` instead of running the
tool. `getInfo()`, `getServers()`, and `McpServerDescriptor` carry
`needsApproval`, and the handler falls back to the client's `needsApproval`
when a session store drops it.
