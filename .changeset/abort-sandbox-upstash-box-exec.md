---
'@tanstack/ai-sandbox-upstash-box': patch
---

A blocking `exec` with a signal now runs as an `exec.session`, so an abort kills the command in the box. Before, the signal was only checked before the command started.
