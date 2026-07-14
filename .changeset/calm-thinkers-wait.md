---
'@tanstack/ai': patch
---

Preserve signed thinking blocks relative to tool calls when converting assistant UI messages. A thinking block that follows a provider-executed tool now starts a new assistant segment instead of being replayed before that tool.
