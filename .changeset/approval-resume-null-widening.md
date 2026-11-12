---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
---

Undo strict-mode `null`s on tool arguments before the input check. An approved call whose history still has those `null`s now runs when `repairToolInput` is off.
