---
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
---

Chat UI now lives on the framework packages at `@tanstack/ai-react/ui`, `@tanstack/ai-solid/ui`, `@tanstack/ai-vue/ui`, and `@tanstack/ai-svelte/ui`.

`createChatHook({ options, chatComponents })` returns `useAppChat` (Svelte: `createAppChat`) and `useChatContext`. `useAppChat()` mixes `AppChat` onto the instance so you render `<chat.AppChat />`.
