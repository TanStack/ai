---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-vue': patch
---

feat: add custom event dispatch support for tools

Tools can now emit custom events during execution via `dispatchEvent()`. Custom events are streamed to clients as `custom_event` stream chunks and surfaced through the client chat hook's `onCustomEvent` callback. This enables tools to send progress updates, intermediate results, or any structured data back to the UI during long-running operations.
