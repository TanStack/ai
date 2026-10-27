---
'@tanstack/ai-mistral': patch
---

Parallel tool calls that Mistral streams whole, all with `index` 0, are no longer merged into one call with a combined name and invalid JSON arguments. A tool call delta whose id differs from the one already in its slot now starts a new call.
