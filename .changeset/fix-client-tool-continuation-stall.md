---
'@tanstack/ai-client': patch
---

fix: prevent client tool continuation stall when multiple tools complete in the same round

When an LLM response triggers multiple client-side tool calls simultaneously, the chat would permanently stall after all tools completed. This was caused by nested `drainPostStreamActions` calls stealing queued continuation checks from the outer drain. Added a re-entrancy guard on `drainPostStreamActions` and a `tool-result` type check in `checkForContinuation` to prevent both the structural and semantic causes of the stall.
