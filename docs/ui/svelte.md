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
    interrupts: { fallback: Fallback },
  })
</script>

<UIChat {ui} {chat} {components} />
```

`Layout.svelte` receives snippets `messages`, `interrupts`, and `input`. `Message.svelte` receives snippet `parts`.

The typed tool map, interrupt map, and fallback rules match the [React contract](./react).
