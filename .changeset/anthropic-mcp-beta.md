---
'@tanstack/ai-anthropic': patch
---

Send the `mcp-client-2025-11-20` beta header when `modelOptions.mcp_servers` is a non-empty array. The servers were forwarded in the request body without the header the MCP connector requires, the same gap #1074 had for `context_management`.
