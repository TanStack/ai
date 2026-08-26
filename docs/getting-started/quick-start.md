---
title: Quick Start
id: quick-start
order: 2
description: "Add streaming chat with a framework hook (or ChatClient) and an OpenAI backend."
keywords:
  - tanstack ai
  - quick start
  - useChat
  - streaming chat
  - openai
  - react
  - vue
  - solid
  - svelte
  - preact
  - angular
  - octane
  - tutorial
  - ai chatbot
redirect_from:
  - /getting-started/quick-start-vue
  - /getting-started/quick-start-svelte
  - /getting-started/quick-start-angular
  - /getting-started/quick-start-octane
---

Pick a framework in the sidebar. Install packages, add a server route that returns SSE, wire the chat hook.

Mobile → [React Native](./quick-start-react-native). No UI → [Server Only](./quick-start-server). One key for many models → [OpenRouter](../adapters/openrouter).

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai
vue: @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai
solid: @tanstack/ai @tanstack/ai-solid @tanstack/ai-openai
svelte: @tanstack/ai @tanstack/ai-svelte @tanstack/ai-openai
preact: @tanstack/ai @tanstack/ai-preact @tanstack/ai-openai
angular: @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai
octane: @tanstack/ai @tanstack/ai-octane @tanstack/ai-openai octane
vanilla: @tanstack/ai @tanstack/ai-client @tanstack/ai-openai

<!-- ::end:tabs -->

Octane: `@tanstack/ai-octane` ships uncompiled `.tsrx`. Add `octane/compiler/vite` (or the rspack / rspeedy equivalent) so the app compiler sees it.

## 2. Server route

Any backend that can return a `Response`. Next.js App Router:

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const body = await request.json()

  try {
    const stream = chat({
      adapter: openaiText('gpt-5.6'),
      messages: body.messages,
    })
    return toServerSentEventsResponse(stream)
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'An error occurred',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
```

Same return value from a TanStack Start POST handler, or SvelteKit `src/routes/api/chat/+server.ts`. Express / Hono: [Server Only](./quick-start-server).

`chat()` reads the AG-UI `threadId` for devtools when the client sends one.

## 3. Client

<!-- ::start:framework -->

# React

```tsx
import { useState } from 'react'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading, error } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (input.trim() && !isLoading) {
      sendMessage(input)
      setInput('')
    }
  }

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role === 'assistant' ? 'Assistant' : 'You'}</strong>
          {message.parts.map((part, idx) =>
            part.type === 'text' ? <p key={idx}>{part.content}</p> : null,
          )}
        </div>
      ))}
      {error ? <p role="alert">{error.message}</p> : null}
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isLoading}
        />
        <button type="submit" disabled={!input.trim() || isLoading}>
          Send
        </button>
      </form>
    </div>
  )
}
```

`useChat` owns message state, streaming, loading, and errors.

# Vue

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-vue'

const input = ref('')

const { messages, sendMessage, isLoading } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
})

function handleSubmit() {
  if (input.value.trim() && !isLoading.value) {
    sendMessage(input.value)
    input.value = ''
  }
}
</script>

<template>
  <div>
    <div v-for="message in messages" :key="message.id">
      <strong>{{ message.role === 'assistant' ? 'Assistant' : 'You' }}</strong>
      <p v-for="(part, idx) in message.parts" :key="idx">
        <template v-if="part.type === 'text'">{{ part.content }}</template>
      </p>
    </div>
    <form @submit.prevent="handleSubmit">
      <input v-model="input" placeholder="Type a message..." :disabled="isLoading" />
      <button type="submit" :disabled="!input.trim() || isLoading">Send</button>
    </form>
  </div>
</template>
```

Script needs `.value`; the template unwraps. Unmount stops in-flight requests (`onScopeDispose`).

# Solid

```tsx ignore
import { createSignal, For, Show } from 'solid-js'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-solid'

export function Chat() {
  const [input, setInput] = createSignal('')
  const { messages, sendMessage, isLoading, error } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  function handleSubmit(e: Event) {
    e.preventDefault()
    const text = input().trim()
    if (text && !isLoading()) {
      sendMessage(text)
      setInput('')
    }
  }

  return (
    <div>
      <For each={messages()}>
        {(message) => (
          <div>
            <strong>{message.role === 'assistant' ? 'Assistant' : 'You'}</strong>
            <For each={message.parts}>
              {(part) => (
                <Show when={part.type === 'text'}>
                  <p>{part.content}</p>
                </Show>
              )}
            </For>
          </div>
        )}
      </For>
      <Show when={error()}>
        {(err) => <p role="alert">{err().message}</p>}
      </Show>
      <form onSubmit={handleSubmit}>
        <input
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          placeholder="Type a message..."
          disabled={isLoading()}
        />
        <button type="submit" disabled={!input().trim() || isLoading()}>
          Send
        </button>
      </form>
    </div>
  )
}
```

Read accessors with `()` — `messages()`, `isLoading()`, `error()`.

# Svelte

Use `createChat` (not `useChat`):

```svelte
<script lang="ts">
import { onDestroy } from 'svelte'
import { createChat, fetchServerSentEvents } from '@tanstack/ai-svelte'

let input = $state('')

const chat = createChat({
  connection: fetchServerSentEvents('/api/chat'),
})

function handleSubmit(e: SubmitEvent) {
  e.preventDefault()
  if (input.trim() && !chat.isLoading) {
    chat.sendMessage(input)
    input = ''
  }
}

onDestroy(() => {
  chat.stop()
})
</script>

<div>
  {#each chat.messages as message (message.id)}
    <div>
      <strong>{message.role === 'assistant' ? 'Assistant' : 'You'}</strong>
      {#each message.parts as part}
        {#if part.type === 'text'}
          <p>{part.content}</p>
        {/if}
      {/each}
    </div>
  {/each}

  <form onsubmit={handleSubmit}>
    <input bind:value={input} placeholder="Type a message..." disabled={chat.isLoading} />
    <button type="submit" disabled={!input.trim() || chat.isLoading}>Send</button>
  </form>
</div>
```

`chat.messages` / `chat.isLoading` are reactive getters. `createChat` does **not** auto-stop on unmount — call `chat.stop()` in `onDestroy` if the page can unmount mid-stream.

# Preact

```tsx ignore
import { useState } from 'preact/hooks'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-preact'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading, error } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  function handleSubmit(e: Event) {
    e.preventDefault()
    if (input.trim() && !isLoading) {
      sendMessage(input)
      setInput('')
    }
  }

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role === 'assistant' ? 'Assistant' : 'You'}</strong>
          {message.parts.map((part, idx) =>
            part.type === 'text' ? <p key={idx}>{part.content}</p> : null,
          )}
        </div>
      ))}
      {error ? <p role="alert">{error.message}</p> : null}
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onInput={(e) => setInput(e.currentTarget.value)}
          placeholder="Type a message..."
          disabled={isLoading}
        />
        <button type="submit" disabled={!input.trim() || isLoading}>
          Send
        </button>
      </form>
    </div>
  )
}
```

# Angular

Call `injectChat` in a field initializer (or constructor) — not in `ngOnInit`.

```typescript ignore
import { Component, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { injectChat } from '@tanstack/ai-angular'
import { fetchServerSentEvents } from '@tanstack/ai-client'

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div>
      @for (message of chat.messages(); track message.id) {
        <div>
          <strong>{{ message.role === 'assistant' ? 'Assistant' : 'You' }}</strong>
          @for (part of message.parts; track $index) {
            @if (part.type === 'text') {
              <p>{{ part.content }}</p>
            }
          }
        </div>
      }
      <form (ngSubmit)="handleSubmit()">
        <input
          [(ngModel)]="input"
          name="input"
          placeholder="Type a message..."
          [disabled]="chat.isLoading()"
        />
        <button type="submit" [disabled]="!input().trim() || chat.isLoading()">
          Send
        </button>
      </form>
    </div>
  `,
})
export class ChatComponent {
  chat = injectChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  input = signal('')

  handleSubmit() {
    const text = this.input().trim()
    if (text && !this.chat.isLoading()) {
      this.chat.sendMessage(text)
      this.input.set('')
    }
  }
}
```

State is read-only signals — call them as functions (`chat.messages()`, `chat.isLoading()`). Destroy stops in-flight requests (`DestroyRef`).

# Octane

```tsx ignore
import { useState } from 'octane'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-octane'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  function handleSubmit() {
    if (input.trim() && !isLoading) {
      void sendMessage(input)
      setInput('')
    }
  }

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role === 'assistant' ? 'Assistant' : 'You'}</strong>
          <p>
            {message.parts
              .filter((part) => part.type === 'text')
              .map((part) => part.content)
              .join('')}
          </p>
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        <input
          value={input}
          placeholder="Type a message..."
          disabled={isLoading}
          onInput={(event) => setInput(event.currentTarget.value)}
        />
        <button type="submit" disabled={!input.trim() || isLoading}>
          Send
        </button>
      </form>
    </div>
  )
}
```

Same hook names as React (`useChat`, …) — change the import path. Octane text controls fire `onInput`, not a synthetic `onChange`. Cleanup is automatic (`attach` on mount, `detach`/`dispose` on unmount).

# Vanilla

```typescript
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat'),
  onMessagesChange: (messages) => {
    console.log(messages)
  },
})

client.attach()
void client.sendMessage('Hello')
```

Call `attach()` when the view appears and `detach()` when it goes away (not `stop()` — that ends the run). Details: [ai-client](../api/ai-client).

<!-- ::end:framework -->

Same surface across hooks: `messages`, `sendMessage`, `isLoading`, `error`, `status`, `stop`, `reload`, `clear`.

## 4. API keys

`.env` / `.env.local` — server only. Never ship keys to the browser.

```bash
# OpenRouter (recommended — 300+ models, one key)
OPENROUTER_API_KEY=sk-or-...

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

## Optional: tools on the server

```typescript
import { chat, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'
import { db } from './db'

const getProductsDef = toolDefinition({
  name: 'getProducts',
  description: 'Search the product catalog',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
})

const getProducts = getProductsDef.server(async ({ query }) => {
  return await db.products.search(query)
})

const stream = chat({
  adapter: openaiText('gpt-5.6'),
  messages: [{ role: 'user', content: 'Find products' }],
  tools: [getProducts],
})
```

## Next

- [Tools](../tools/tools)
- [Client Tools](../tools/client-tools)
- [API Reference](../api/ai)
