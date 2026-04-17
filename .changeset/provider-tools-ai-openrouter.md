---
'@tanstack/ai-openrouter': minor
---

**Breaking export change.** `createWebSearchTool` has been removed from the package root. Import `webSearchTool` from `@tanstack/ai-openrouter/tools` instead. See Migration Guide §6 for the before/after snippet.

Alongside: the new `/tools` subpath exposes `webSearchTool` (branded `OpenRouterWebSearchTool`) and the existing `convertToolsToProviderFormat`. A new `supports.tools` channel on each chat model gates provider tools at the type level.
