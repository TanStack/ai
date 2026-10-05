---
'@tanstack/ai-harness': patch
---

Do not offer an approval or a client-tool interrupt again after its tool ran. When a resumed turn failed, stopped, or hit its time limit after the tool ran, the interrupt came back, and answering it again ran the tool a second time. Now the harness marks it answered in the interrupt store, and a durable host without an interrupt store skips it when it rebuilds from the log. A resume that stops before its tool runs stays open for a retry.
