---
'@tanstack/ai-sandbox': patch
---

A reconnect during a long tool call no longer writes the rest of a durable sandbox run twice. The host that started the run holds the driver claim until the run ends, so the reconnect tails the log.
