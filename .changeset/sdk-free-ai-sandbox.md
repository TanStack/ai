---
'@tanstack/ai-sandbox': patch
---

The host tool bridge now uses the MCP v2 server package `@modelcontextprotocol/server`. The bridge works the same way. The package is marked `"sideEffects": false`, so bundlers can drop the modules that you do not import.
