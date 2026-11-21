---
'@tanstack/ai-mcp-sandbox': minor
---

Add `runSandboxed()` and `sandboxedChatTool()`: run an untrusted snippet in an isolate with injected facades and hard limits, for `chat()` tools and server functions. These are the unscoped siblings of the MCP-only `sandboxedTool()` (no OAuth scope gate or manifest).
