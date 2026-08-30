---
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
---

Chat UI now lives on the framework packages at `@tanstack/ai-react/ui`, `@tanstack/ai-solid/ui`, `@tanstack/ai-vue/ui`, and `@tanstack/ai-svelte/ui`.

Call `useChat(options)` from the framework package. Pass that instance and a typed `components` map to `<Chat chat={chat} components={components} />`. `useChatContext()` reads the same instance from inside `Chat`.

`createChatHook(options)` on the main package still returns a bound `useChat`. It does not take `chatComponents`.
