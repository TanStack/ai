---
'@tanstack/ai': patch
---

The client `StreamProcessor` no longer logs a `console.warn` when it skips a tool call of an answer that stopped at the output limit. Skipping such a call is expected.
