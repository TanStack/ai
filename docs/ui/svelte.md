---
title: Svelte Chat UI
id: typed-headless-ui-svelte
order: 4
description: "Render a typed chat tree with Chat, snippets, and a component map."
keywords:
  - tanstack ai
  - Chat
  - svelte
  - headless ui
  - ToolProps
---

Install `@tanstack/ai-svelte`. Import `Chat` from `@tanstack/ai-svelte/ui`. Call `createChat(chatOptions)` in the page. Pass `{chat}` and `components` into `Chat`.

The server route matches the [React page](./react). Use `gpt-5.6` on the OpenAI text adapter.

## Client

```svelte
<script lang="ts">
  import { fetchServerSentEvents, createChat } from '@tanstack/ai-svelte'
  import { Chat } from '@tanstack/ai-svelte/ui'
  import Layout from './Layout.svelte'
  import Message from './Message.svelte'
  import Fallback from './Fallback.svelte'
  import Weather from './Weather.svelte'

  const chatOptions = {
    connection: fetchServerSentEvents('/api/chat'),
    tools: [weatherTool],
  }

  const components = {
    layout: Layout,
    message: Message,
    parts: { fallback: Fallback },
    tools: { getWeather: Weather },
  }

  const chat = createChat(chatOptions)
</script>

<Chat {chat} {components} />
```

Layout receives a `chat` prop and `messages`, `interrupts`, and `input` snippets. Message receives a `parts` snippet.

Type a tool file with `ToolProps`. Share the same `chatOptions` module that you pass to `createChat`.
