---
'@tanstack/openai-base': patch
---

Report `incomplete-stream` when a started Chat Completions stream ends without a finish reason or a final usage-only chunk. Keep partial text and close open lifecycles without reporting success or executing pending server tools. Preserve trailing usage and the existing usage-only completion fallback.
