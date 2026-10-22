---
'@tanstack/ai-code-mode': patch
---

The `execute_typescript` tool description and the code-mode system prompt now tell the model that the tool returns `{ success, result, logs, error }`, where `result` is the value its code returned.
