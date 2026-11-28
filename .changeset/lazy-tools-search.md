---
'@tanstack/ai': minor
'@tanstack/ai-code-mode': minor
---

Add `lazyToolsConfig.catalog: 'search'`. The discovery catalog then lists no lazy tool names, so hundreds of lazy tools cost almost no prompt tokens. The model finds tools with a `query` to `__lazy__tool__discovery__` (`chat()`) or `discover_tools` (Code Mode), and gets the 10 best keyword matches. Exact `toolNames` still work. `@tanstack/ai` also exports `searchLazyTools(tools, query, limit?)`, the ranking that both use.
