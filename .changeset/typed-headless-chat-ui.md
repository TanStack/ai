---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
---

Add typed headless `createChatUI()` adapters. Chat options control the types of message parts, tools, structured output, and interrupts. `defineComponents` requires a component for every tool name and every registered interrupt id. `InterruptProps` pins a tool approval or a registered generic interrupt. Old Chat orchestration stays importable and deprecated until 1.0.
