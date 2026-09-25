---
'@tanstack/ai-code-mode': patch
---

State in the Code Mode system prompt and in the `execute_typescript` tool description that `discover_tools` is a separate tool call. It is not a function inside the sandbox. Models no longer call `discover_tools` from inside `execute_typescript` and get a `ReferenceError`.
