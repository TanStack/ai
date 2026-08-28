---
title: Svelte Chat UI
id: typed-headless-ui-svelte
order: 4
description: "Build a typed, headless Svelte 5 chat UI with createChatUI, snippets, and static components."
keywords:
  - tanstack ai
  - createChatUI
  - svelte
  - headless ui
  - ToolProps
---

Install `@tanstack/ai-svelte`. Import the UI factory from `@tanstack/ai-svelte/ui`. Call `createChatHook({ options, chatComponents })` once. Your app calls `createAppChat()` to create the instance. Pass `{ui}` and `{chat}` into `UIChat`.

The factory needs a `tools` entry for every tool name in `chatOptions`. It also needs an `interrupts.generic` entry for every interrupt id. `generic.fallback` is optional. Pass widgets in `chatComponents`, the same way Form and Table register components.

The server route matches the [React page](./react). Use `gpt-5.6` on the OpenAI text adapter.

## Client

```svelte
<script lang="ts">
  import { fetchServerSentEvents } from '@tanstack/ai-svelte'
  import { createChatHook, UIChat } from '@tanstack/ai-svelte/ui'
  import { toolDefinition } from '@tanstack/ai'
  import { z } from 'zod'
  import Layout from './Layout.svelte'
  import Message from './Message.svelte'
  import Weather from './Weather.svelte'
  import Fallback from './Fallback.svelte'

  const getWeather = toolDefinition({
    name: 'getWeather',
    description: 'Look up weather',
    inputSchema: z.object({ city: z.string() }),
    outputSchema: z.object({ temperature: z.number() }),
  }).client()

  const chatOptions = {
    connection: fetchServerSentEvents('/api/chat'),
    tools: [getWeather],
  }

  const { createAppChat, ui } = createChatHook({
    options: chatOptions,
    chatComponents: {
      layout: Layout,
      message: Message,
      parts: { fallback: Fallback },
      tools: { getWeather: Weather },
    },
  })
  const chat = createAppChat()
</script>

<UIChat {ui} {chat} />
```

`Layout.svelte` receives snippets `messages`, `interrupts`, and `input`. `Message.svelte` receives snippet `parts`. A tool with an approval receives prop `interrupt`.

## Type a component in its own file

Type the `$props()` of a tool file with `ToolProps`. Share the same `chatOptions` module that you pass to `createChatUI`.

```svelte
<script lang="ts">
  import type { ToolProps } from '@tanstack/ai-svelte/ui'
  import { chatOptions } from './chat-options'

  let { part }: ToolProps<typeof chatOptions, 'getWeather'> = $props()
</script>

<strong>{part.input?.city}</strong>
```

Part components use `PartProps<typeof chatOptions, 'text'>`. Then `part` is already a text part.

Interrupt components use `InterruptProps<typeof chatOptions, 'choosePlan'>`. Then `interrupt.payload` matches the definition.

Mapped components do not receive `chat` as a prop. Call `ui.useChatContext()` when a component needs live chat. That call opts the component into chat updates. Nested children can call it too.

## Read chat from `ui.useChatContext()`

Import the same `ui` descriptor in a child file. Call `ui.useChatContext()` only under `UIChat` or `UIProvider`.

```svelte
<script lang="ts">
  import { ui } from './chat-ui'

  const chat = ui.useChatContext()
</script>

<p>{chat.messages.length} messages</p>
```

`createChat(chatOptions)` owns the state. `ui.useChatContext()` reads the instance you passed into `UIChat`. A call outside that tree throws.

## Interrupts

Tool approvals sit in the tool when you read the `interrupt` prop. Put a component on `interrupts.tools` to send that approval to the list instead. Generic interrupts always sit in the list under `interrupts.generic`: `{ choosePlan, fallback }`. An unbound interrupt uses `fallback`. Branch on `interrupt.kind === 'unbound'` if the copy must differ.

The full map is on the [React page](./react).
