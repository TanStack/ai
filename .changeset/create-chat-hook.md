---
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-react-ui': minor
'@tanstack/ai-solid-ui': minor
---

Add `createChatHook(chatOptions)`. It returns a bound `useChat` (or `createChat` in Svelte) so the screen does not pass the same options object into `useChat` and `createChatUI`.
