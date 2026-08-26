---
title: Custom Chat UI Adapters
id: typed-headless-ui-custom-adapters
order: 5
description: "Build a framework adapter on @tanstack/ai-client/ui. The core is types and selectors only."
keywords:
  - tanstack ai
  - createUI
  - custom adapter
  - headless ui
---

Import `@tanstack/ai-client/ui`. Do not import it from the main client entry.

The subpath gives you:

1. `selectChatUI` to match tool results and split list vs inline interrupts
2. `partTypeToKey` to turn `tool-call` into `toolCall`
3. Option types for tools, generic interrupts, and `outputSchema`

Your adapter owns:

1. Native components and context
2. Native reactivity
3. Render callbacks, slots, or snippets
4. Development warnings for missing mapped keys

Do not add default markup. Do not add a new store. The app owns `useChat` or `createChat`.

Call `selectChatUI({ messages, interrupts, inlineToolNames })`. Automatic traversal skips a `tool-result` only when `matched` is true. Keep unmatched results.

Warn once per missing runtime key in development. Each build tool detects development mode differently, so the adapter prints the warning.

See the [React](./react), [Solid](./solid), [Vue](./vue), and [Svelte](./svelte) adapters for the public names to match: `Chat`, `Provider`, `Messages`, `Message`, `Part`, `Interrupts`, `Interrupt`, and `defineComponents`.
