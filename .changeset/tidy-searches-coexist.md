---
'@tanstack/ai-anthropic': patch
---

Keep ordinary function tools named `web_search` distinct from Anthropic's native web-search tool by checking the provider metadata before conversion.
