---
'@tanstack/ai-bedrock': patch
---

The Bedrock Converse adapter now sets `status: 'error'` on a tool result that has an `error`. This includes an empty error string. Before, every tool result went out with `status: 'success'`, so the model did not know that the tool failed.
