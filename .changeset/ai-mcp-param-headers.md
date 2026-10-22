---
'@tanstack/ai-mcp': patch
---

Send the `Mcp-Param-*` headers on spec 2026-07-28 tool calls. A tool argument marked with `x-mcp-header` in the input schema is now copied to its header, so strict servers such as GitHub's remote MCP server accept the call. Spec 2026 calls now go through the SDK `Client.callTool`, and use the SDK timeout, abort, and progress handling.
