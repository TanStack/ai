---
title: Custom Chat UI Adapters
id: typed-headless-ui-custom-adapters
order: 5
description: "Build a chat UI adapter for a framework that has none. @tanstack/ai-client/ui gives you the types and selectors. Your adapter adds components and reactivity."
keywords:
  - tanstack ai
  - createChatUI
  - custom adapter
  - headless ui
---

Your framework has no chat UI package, and you want the same typed widget maps that React and Vue get. Build an adapter on `@tanstack/ai-client/ui`. That subpath holds the framework-free part: types and selectors. Your adapter adds the components and the reactivity.

## What the core gives you

Import from `@tanstack/ai-client/ui`, not from the main client entry:

- `selectChatUI`: matches tool results to tool calls, and splits list interrupts from inline interrupts.
- `partTypeToKey`: turns a part type such as `tool-call` into a map key such as `toolCall`.
- Option types for tools, generic interrupts, and `outputSchema`.

## What your adapter owns

- Native components and context.
- Native reactivity.
- Render callbacks, slots, or snippets.
- Development warnings for missing map keys.

Do not add default markup. Do not add a new store. The app owns the chat instance, from `useAppChat` in `createChatHook`, or from `useChat` or `createChat`.

## Build it

1. Call `selectChatUI({ messages, interrupts, inlineToolNames })`.
2. In automatic traversal, skip a `tool-result` part only when `matched` is `true`. Keep unmatched results.
3. Warn once for each missing runtime key in development. Each build tool detects development mode in a different way, so the adapter prints the warning.
4. Match the public names of the existing adapters: `Chat`, `Provider`, `Messages`, `Message`, `Part`, `Interrupts`, `Interrupt`, `useChatContext`, and `createChatHookContexts`.

The [React](./react), [Solid](./solid), [Vue](./vue), [Svelte](./svelte), and [Remix](./remix) adapters show those names in use.
