---
'@tanstack/ai-sandbox': minor
---

`ToolBridgeCore.callTool(name, args, { signal })` takes an optional signal for one call. The tool gets a signal that aborts when this signal or the bridge `signal` aborts. The host MCP bridge passes the request signal, so a closed `tools/call` request stops the bridged tool.
