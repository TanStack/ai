---
'@tanstack/ai-harness': patch
---

A host that opens a thread that another host owns keeps its session events (plugin state, plugin events, warnings) off the log. Before, the MCP plugin's connection status on a second instance took the log from the owner, and the owner's turn stopped.
