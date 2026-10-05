---
'@tanstack/ai-harness': patch
---

Keep a host record that lands during the last model call of a turn. At the end of a turn, `withPersistence` tags older messages with the run, so the engine save rewrites them, and the log rebase then kept only the engine list. A host message that a record had folded in after the engine's last save was lost. Now the engine list still wins for the older messages, and the host messages that came after stay after it.
