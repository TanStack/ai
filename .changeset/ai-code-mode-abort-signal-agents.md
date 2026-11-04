---
'@tanstack/ai-code-mode': minor
---

`IsolateContext.execute(code, options?)` takes an optional `{ signal }`. `execute_typescript` passes the abort signal of the tool call, so a driver can stop the run.
