---
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
---

Chat UI now lives on the framework packages at `@tanstack/ai-react/ui`, `@tanstack/ai-solid/ui`, `@tanstack/ai-vue/ui`, and `@tanstack/ai-svelte/ui`.

`createChatHook` registers widgets in named groups and returns `useAppChat` (Svelte: `createAppChat`) and `useChatContext`. `useAppChat()` mixes `AppChat` onto the instance, so you render `<chat.AppChat />`.

```tsx
const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  context: { chatContext, partContext, interruptContext },
  components: { input: ChatInput, layout: ChatLayout, message: ChatMessage },
  toolsComponents: { getWeather: WeatherTool },
  interruptsComponents: { generic: { choosePlan: ChoosePlan } },
  partsComponents: { text: TextPart, fallback: FallbackPart },
})
```

`layout` receives `Messages`, `Interrupts`, and `Input` as components, and `message` receives `Parts`. `Input` is on the props only when the config registers an `input`.

`createChatUI` takes the same groups as its second argument for manual traversal.
