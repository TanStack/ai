---
'@tanstack/ai': patch
'@tanstack/ai-client': patch
---

Keep a successful tool-call part at `input-complete` after its result is applied. A client tool result set the tool-call part to `complete`, which raced the finalize-stream safety net and depended on async ordering (regressed in #1233). The tool-call part now stays at its terminal `input-complete` state, and the completed result stays on the separate tool-result part.
