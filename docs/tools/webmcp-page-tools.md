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

Read the WebMCP tools already registered on `document.modelContext` and pass those same tools to the in-page chat.

The chat gets them as client tools. When the model calls one, the chat runs it through WebMCP.

> [!WARNING]
> WebMCP is experimental. During SSR, in an insecure context, or in a browser without WebMCP, the tool list stays empty.

## Set it up

You need a working chat first. If you do not have one, start with the [Quick Start](../getting-started/quick-start).

### 1. Accept client tools on the server

The server does not know which tools the page has. Let the client send them, and merge them with `mergeAgentTools`:

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
    threadId: params.threadId,
    tools: mergeAgentTools([], params.tools),
  })
  return toServerSentEventsResponse(stream)
}
```

> [!WARNING]
> `params.tools` comes from the browser. The model can call these tools, but they run in the browser, not on the server. Keep sensitive work behind your own server checks.

### 2. Give the page tools to the chat

Call the page tools API for your framework. Pass the result to the chat as `tools`.

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
  const { messages, sendMessage } = useChat({ connection, tools: pageTools, threadId: 'support-chat' })

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
  threadId: 'support-chat',
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
    threadId: 'support-chat',
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
    threadId: 'support-chat',
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
  const { sendMessage } = useChat({ connection, tools: pageTools, threadId: 'support-chat' })

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
    threadId: 'support-chat',
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
  const { sendMessage } = useChat({ connection, tools: pageTools, threadId: 'support-chat' })

  return (
    <button type="button" onClick={() => sendMessage('Open the help panel')}>
      Ask
    </button>
  )
}
```

# Remix

Pass the component `Handle` to `createPageWebMCPTools`. When the tools change, it calls `handle.update()`. Read `page.tools` in a `tools` getter. The chat reads the getter each time a run starts.

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
    threadId: 'support-chat',
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

That is all. Your chat can now call every WebMCP tool on the page. Ask it to "Open the help panel", and the model calls the page tool that does it.

## How it works

1. The page tools API reads the tools from `document.modelContext`.
2. It turns each tool into a client tool, with the same name, description, and input schema.
3. The chat sends these tool definitions to your server. `mergeAgentTools` gives them to the model.
4. When the model calls a tool, the chat runs it in the browser through WebMCP.
5. When the page adds or removes a tool, the list updates.

To send your own client tools to WebMCP, see [WebMCP Tools](./webmcp).

## Advanced

### Skip tools with a filter

Pass `filter` to skip a tool. Return `false`, and the chat does not get that tool. The filter gets the WebMCP tool, so you can read these fields:

- `name`
- `origin`: the origin of the document that registered the tool.
- `annotations`

This filter keeps only read-only tools from your own origin:

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

Some providers reject a tool name with a period, such as `help.open`. WebMCP allows periods. Use `filter` to skip those tools.

### Handle read errors

Every framework API takes the same two options: `filter` and `onError`.

`onError` gets a failed WebMCP read. An example is a `NotAllowedError` from the `tools` permissions policy. When a read fails, the last good list stays in place.

### Duplicate tool names

Tool names must be unique after the filter runs. This includes tools from different frames.

If two tools have the same name:

- `getWebMCPTools()` rejects.
- A subscription sends the error to `onError` and keeps the last good list.

Give the tools unique names, or use `filter` to keep only one of them.

### Tool results

WebMCP returns each tool result as a string. If the string is valid JSON, the chat parses it. If not, the chat gets the string as it is.

### Read page tools without a framework

Use `getWebMCPTools` from `@tanstack/ai-client` to read the tools one time:

```ts
import { ChatClient, fetchServerSentEvents, getWebMCPTools } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat'),
  threadId: 'support-chat',
  tools: await getWebMCPTools(),
})
```

To keep the list current, use `subscribeWebMCPTools`. It calls your listener now, and again after each WebMCP `toolchange` event. Abort the signal to stop:

```ts
import {
  ChatClient,
  fetchServerSentEvents,
  subscribeWebMCPTools,
} from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat'),
  threadId: 'support-chat',
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

If WebMCP is not available, `subscribeWebMCPTools` calls your listener one time with an empty array.

Every framework package also exports `getWebMCPTools` and `subscribeWebMCPTools`.
