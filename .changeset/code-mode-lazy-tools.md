---
'@tanstack/ai': minor
'@tanstack/ai-code-mode': minor
---

Add lazy tool support (progressive disclosure) to Code Mode. Tools marked `lazy: true` are kept out of the `execute_typescript` system prompt and listed in a discoverable catalog; the model fetches their TypeScript signatures on demand via a new `discover_tools` tool. A shared optional `lazyToolsConfig` (`includeDescription: 'none' | 'first-sentence' | 'full'`) tunes the catalog detail for both `chat()` and `createCodeMode()`. `createCodeMode` now also returns `discoveryTool` and a `tools` array (backward compatible — `tool` and `systemPrompt` are unchanged).
