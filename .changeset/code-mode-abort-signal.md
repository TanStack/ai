---
'@tanstack/ai-code-mode': patch
'@tanstack/ai-code-mode-snippets': patch
---

Pass the chat run's `abortSignal` and runtime `context` to the tools that Code Mode calls as `external_*` functions. A tool that listens to the signal now stops its in-flight work when the run stops, for example MCP tools. A call does not start when the run is already aborted. `toolCallId` and `inputResponse` of the `execute_typescript` call are not passed on.
