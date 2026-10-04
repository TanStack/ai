---
'@tanstack/ai-harness': patch
'@tanstack/ai-mcp': patch
---

`/connect` now works with MCP servers that send `iss` on the sign-in callback (RFC 9207), such as Linear. `startLoopbackReceiver().waitForCode()` resolves `{ code, iss }`, and `mcpConnector` passes `iss` on to the MCP SDK. A sign-in error names the service, for example `Notion: Sign-in timed out.`

The session view clears the pending sign-in of a connector when its `connect:<id>` command ends.
