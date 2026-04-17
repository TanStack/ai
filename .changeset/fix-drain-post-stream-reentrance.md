---
'@tanstack/ai-client': patch
---

fix(ai-client): prevent drainPostStreamActions re-entrancy stealing queued actions

When multiple client tools complete in the same round, nested `drainPostStreamActions()` calls from `streamResponse()`'s `finally` block could steal queued actions, permanently stalling the conversation. Added a re-entrancy guard and a `shouldAutoSend()` check requiring tool-call parts before triggering continuation.
