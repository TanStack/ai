---
'@tanstack/ai-mcp': minor
---

New optional signals. Old calls work the same.

- `createMCPClient({ signal })` cancels the connect handshake.
- `tools({ signal })`, `resources({ signal })`, `readResource(uri, { signal })`, `resourceTemplates({ signal })`, `prompts({ signal })`, and `getPrompt(name, args, { signal })` send the signal to the MCP SDK.
- The lazy tool list in `callTool` uses the signal of the call.
- The handler from `createMcpAppCallHandler` takes `(req, { signal })` and passes it to the connect, the tool list, and the tool call.
