---
'@tanstack/ai-harness': patch
---

A durable host that opens a thread while another host holds its work claim no longer recovers that host's inputs, also an input that has no run lease yet. The crash sweep recovers them after the claim expires.
