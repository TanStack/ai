---
title: Page WebMCP Tools in Chat
id: webmcp-page-tools
order: 6
description: "Read the WebMCP tools that a page registers and give them to your TanStack AI chat as client tools."
keywords:
  - tanstack ai
  - webmcp
  - browser tools
  - client tools
  - usePageWebMCPTools
  - createPageWebMCPTools
  - injectPageWebMCPTools
  - getWebMCPTools
---

Your page already has WebMCP tools. A widget, a library, or your own code registered them on `document.modelContext`. You want your in-page chat to use the same tools, without a second copy of each tool.

The page tools API reads the tools from `document.modelContext` and gives them to the chat as client tools. When the model calls a tool, the chat runs the tool through WebMCP.

> **Experimental:** WebMCP support is experimental. During SSR, in insecure contexts, or in unsupported browsers, the tool list stays empty.

## 1. Accept client tools on the server

The server does not know the page tools. Let the client declare them with `mergeAgentTools`:

```ts
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  mergeAgentTools,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6-astra'),
    messages: params.messages,
    tools: mergeAgentTools([], params.tools),
  })
  return toServerSentEventsResponse(stream)
}
```

> **Security:** `params.tools` comes from the browser. The model can call these tools, but the tools run in the browser, not on the server. Keep sensitive work behind your own server checks.

## 2. Give the page tools to the chat

Use the page tools API for your framework. Pass the result to the chat as `tools`.

<!-- ::start:framework -->

# React

`usePageWebMCPTools` returns an array. The array updates when the page adds or removes a tool.

```tsx
import {
  fetchServerSentEvents,
  useChat,
  usePageWebMCPTools,
} from '@tanstack/ai-react'

const connection = fetchServerSentEvents('/api/chat')

export function Chat() {
  const pageTools = usePageWebMCPTools()
  const { messages, sendMessage } = useChat({ connection, tools: pageTools })

  return (
    <button type="button" onClick={() => sendMessage('Open the help panel')}>
      Ask ({messages.length} messages)
    </button>
  )
}
```

# Vue

`usePageWebMCPTools` returns a ref. Pass the ref to `useChat`.

```vue
<script setup lang="ts">
import {
  fetchServerSentEvents,
  useChat,
  usePageWebMCPTools,
} from '@tanstack/ai-vue'

const pageTools = usePageWebMCPTools()
const { sendMessage } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  tools: pageTools,
})
</script>

<template>
  <button type="button" @click="sendMessage('Open the help panel')">
    Ask
  </button>
</template>
```

# Solid

`usePageWebMCPTools` returns an accessor. Read it in a `tools` getter.

```tsx
import {
  fetchServerSentEvents,
  useChat,
  usePageWebMCPTools,
} from '@tanstack/ai-solid'

export function Chat() {
  const pageTools = usePageWebMCPTools()
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    get tools() {
      return pageTools()
    },
  })

  return (
    <button type="button" onClick={() => sendMessage('Open the help panel')}>
      Ask
    </button>
  )
}
```

# Svelte

`createPageWebMCPTools` returns an object with a reactive `tools` field. Read it in a `tools` getter.

```svelte
<script lang="ts">
  import {
    createChat,
    createPageWebMCPTools,
    fetchServerSentEvents,
  } from '@tanstack/ai-svelte'

  const page = createPageWebMCPTools()
  const chat = createChat({
    connection: fetchServerSentEvents('/api/chat'),
    get tools() {
      return page.tools
    },
  })
</script>

<button type="button" onclick={() => chat.sendMessage('Open the help panel')}>
  Ask
</button>
```

# Preact

`usePageWebMCPTools` returns an array. The array updates when the page adds or removes a tool.

```tsx
import {
  fetchServerSentEvents,
  useChat,
  usePageWebMCPTools,
} from '@tanstack/ai-preact'

const connection = fetchServerSentEvents('/api/chat')

export function Chat() {
  const pageTools = usePageWebMCPTools()
  const { sendMessage } = useChat({ connection, tools: pageTools })

  return (
    <button type="button" onClick={() => sendMessage('Open the help panel')}>
      Ask
    </button>
  )
}
```

# Angular

`injectPageWebMCPTools` returns a signal. Pass the signal to `injectChat`.

```ts ignore
import { Component } from '@angular/core'
import {
  fetchServerSentEvents,
  injectChat,
  injectPageWebMCPTools,
} from '@tanstack/ai-angular'

@Component({
  selector: 'app-chat',
  standalone: true,
  template: `<button type="button" (click)="ask()">Ask</button>`,
})
export class Chat {
  pageTools = injectPageWebMCPTools()
  chat = injectChat({
    connection: fetchServerSentEvents('/api/chat'),
    tools: this.pageTools,
  })

  ask() {
    void this.chat.sendMessage('Open the help panel')
  }
}
```

# Octane

`usePageWebMCPTools` returns an array. The array updates when the page adds or removes a tool.

```tsx
import {
  fetchServerSentEvents,
  useChat,
  usePageWebMCPTools,
} from '@tanstack/ai-octane'

const connection = fetchServerSentEvents('/api/chat')

export function Chat() {
  const pageTools = usePageWebMCPTools()
  const { sendMessage } = useChat({ connection, tools: pageTools })

  return (
    <button type="button" onClick={() => sendMessage('Open the help panel')}>
      Ask
    </button>
  )
}
```

# Remix

Pass the component `Handle` to `createPageWebMCPTools`. It calls `handle.update()` when the tools change. Read `page.tools` in a `tools` getter. The chat reads the getter each time a run starts.

```tsx
import {
  createChat,
  createPageWebMCPTools,
  fetchServerSentEvents,
} from '@tanstack/ai-remix'
import { clientEntry, createElement, on } from 'remix/ui'

export const Chat = clientEntry(import.meta.url, function Chat(handle) {
  const page = createPageWebMCPTools(handle)
  const chat = createChat(handle, {
    connection: fetchServerSentEvents('/api/chat'),
    get tools() {
      return page.tools
    },
  })

  return () =>
    createElement(
      'button',
      {
        type: 'button',
        mix: on<HTMLButtonElement>('click', () => {
          void chat.sendMessage('Open the help panel')
        }),
      },
      'Ask',
    )
})
```

<!-- ::end:framework -->

## 3. Skip tools with a filter

Pass `filter` to skip a tool. Return `false` and the chat does not get that tool. The filter gets the WebMCP tool, so you can read `name`, `origin`, and `annotations`:

```tsx
import { usePageWebMCPTools } from '@tanstack/ai-react'

export function useReadOnlyPageTools() {
  return usePageWebMCPTools({
    filter: (tool) =>
      tool.origin === location.origin &&
      tool.annotations?.readOnlyHint === true,
  })
}
```

Every framework API takes the same `filter` and `onError` options. `onError` gets a failed WebMCP read, for example a `NotAllowedError` from the `tools` permissions policy. The last good list stays in place.

Tool names must be unique after filtering, including tools from different frames. If names repeat, `getWebMCPTools()` rejects and subscriptions report the error through `onError`. Subscriptions keep the last good list. Give the tools unique names or use `filter` to select one of them.

Some providers reject a tool name with a period, such as `help.open`. WebMCP allows periods. Skip those tools with `filter`.

## Read page tools without a framework

Use `getWebMCPTools` from `@tanstack/ai-client` to read the tools one time:

```ts
import { ChatClient, fetchServerSentEvents, getWebMCPTools } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat'),
  tools: await getWebMCPTools(),
})
```

To keep the list current, use `subscribeWebMCPTools`. It calls your listener now and after each WebMCP `toolchange` event. Abort the signal to stop:

```ts
import {
  ChatClient,
  fetchServerSentEvents,
  subscribeWebMCPTools,
} from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat'),
})
const subscription = new AbortController()

subscribeWebMCPTools((tools) => client.updateOptions({ tools }), {
  signal: subscription.signal,
  filter: (tool) => tool.origin === location.origin,
})

export function stopPageTools() {
  subscription.abort()
}
```

Every framework package also exports `getWebMCPTools` and `subscribeWebMCPTools`.

Your chat can now call every WebMCP tool on the page that passes your filter. To expose your own client tools to WebMCP, see [WebMCP Tools](./webmcp).
