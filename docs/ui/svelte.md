---
title: Svelte Chat UI
id: typed-headless-ui-svelte
order: 4
description: "Build a typed, headless Svelte 5 chat UI with createUI, snippets, and static components."
keywords:
  - tanstack ai
  - createUI
  - svelte
  - headless ui
  - ToolProps
---

Install `@tanstack/ai-svelte-ui`. Call `createUI(chatOptions)` once. Pass `{ui}`, `{chat}`, and `{components}` into `UIChat`.

The server route matches the [React page](./react). Use `gpt-5.2` on the OpenAI text adapter.

## Client

```svelte
<script lang="ts">
  import { createChat, fetchServerSentEvents } from '@tanstack/ai-svelte'
  import { createUI, UIChat } from '@tanstack/ai-svelte-ui'
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

  const ui = createUI(chatOptions)
  const chat = createChat(chatOptions)
  const components = ui.defineComponents({
    layout: Layout,
    message: Message,
    parts: { fallback: Fallback },
    tools: { getWeather: Weather },
    interrupts: { generic: { fallback: Fallback } },
  })
</script>

<UIChat {ui} {chat} {components} />
```

`Layout.svelte` receives snippets `messages`, `interrupts`, and `input`. `Message.svelte` receives snippet `parts`. A tool with an inline approval receives snippet `renderInterrupt`.

## Type a component in its own file

Type the `$props()` of a tool file with `ToolProps`. Share the same `chatOptions` module that you pass to `createUI`.

```svelte
<script lang="ts">
  import type { ToolProps } from '@tanstack/ai-svelte-ui'
  import { chatOptions } from './chat-options'

  let { part }: ToolProps<typeof chatOptions, 'getWeather'> = $props()
</script>

<strong>{part.input?.city}</strong>
```

Registered generic interrupts use `RegisteredInterruptProps<typeof chatOptions, 'choosePlan'>`.

## Read chat from `ui.useChat()`

Import the same `ui` descriptor in a child file. Call `ui.useChat()` only under `UIChat` or `UIProvider`.

```svelte
<script lang="ts">
  import { ui } from './chat-ui'

  const chat = ui.useChat()
</script>

<p>{chat.messages.length} messages</p>
```

`createChat(chatOptions)` owns the state. `ui.useChat()` reads the instance you passed into `UIChat`. A call outside that tree throws.

## Interrupts

Tool approvals can sit in the tool (`placement: 'inline'` plus the `renderInterrupt` snippet) or in the list (a direct component). Generic interrupts always sit in the list under `interrupts.generic`: `{ choosePlan, fallback }`. An unbound interrupt uses `fallback`. Branch on `interrupt.kind === 'unbound'` if the copy must differ.

The full map is on the [React page](./react).
