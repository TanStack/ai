---
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-react-ui': minor
'@tanstack/ai-solid-ui': minor
'@tanstack/ai-vue-ui': minor
'@tanstack/ai-svelte-ui': minor
---

Align chat UI with Form and Table. `createChatHook` returns a bound `useChat`. `createChatUI` now takes widgets at factory time, mixes them onto Part / Interrupt / `UI.Input`, and exposes `createChatUIContexts` plus `useChatContext`.
