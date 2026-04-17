---
'@tanstack/ai-ollama': patch
---

refactor(ai-ollama): extract tool conversion into `src/tools/` matching peer adapters

Tool handling lived inline inside the text adapter with raw type casts. It is now split into a dedicated `tool-converter.ts` / `function-tool.ts` pair (mirroring the structure used by `ai-openai`, `ai-anthropic`, `ai-grok`, and `ai-groq`) and re-exported from the package index as `convertFunctionToolToAdapterFormat` and `convertToolsToProviderFormat`. Runtime behavior is unchanged.
