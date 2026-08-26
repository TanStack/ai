---
title: "Quick Start: Svelte"
id: quick-start-svelte
order: 4
description: "Streaming chat in SvelteKit with createChat, Svelte 5 runes, and OpenAI."
keywords:
  - tanstack ai
  - svelte
  - sveltekit
  - svelte 5
  - quick start
  - streaming chat
  - openai
  - runes
---

If you need SvelteKit chat → install packages, add `/api/chat`, wire `createChat` on the page.

Prefer one key for many models → [OpenRouter](../adapters/openrouter).

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

svelte: @tanstack/ai @tanstack/ai-svelte @tanstack/ai-openai

<!-- ::end:tabs -->

## 2. Server route

```typescript ignore
// src/routes/api/chat/+server.ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const body = await request.json()

  try {
    // `chat()` uses the AG-UI `threadId` for devtools correlation
    // when available — no need to plumb `conversationId` manually.
    const stream = chat({
      adapter: openaiText('gpt-4o'),
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

`toServerSentEventsResponse` returns a standard `Response` (SvelteKit, Hono, Workers, etc.).

## 3. Page component

Use `createChat` (not `useChat`):

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
import { createChat, fetchServerSentEvents } from '@tanstack/ai-svelte'

let input = $state('')

const chat = createChat({
  connection: fetchServerSentEvents('/api/chat'),
})

function handleSubmit() {
  if (input.trim() && !chat.isLoading) {
    chat.sendMessage(input)
    input = ''
  }
}
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

`chat.messages` / `chat.isLoading` are reactive getters (no `.value`). Same surface as React/Vue: `messages`, `sendMessage`, `isLoading`, `error`, `status`, `stop`, `reload`, `clear`.

## 4. API keys

```bash
# OpenRouter (recommended -- access 300+ models with one key)
OPENROUTER_API_KEY=sk-or-...

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

Server-only. Never expose to the browser.

## Cleanup on unmount

`createChat` does **not** auto-stop streams. If the page can unmount mid-stream:

```svelte
<script lang="ts">
import { onDestroy } from 'svelte'
import { createChat, fetchServerSentEvents } from '@tanstack/ai-svelte'

const chat = createChat({
  connection: fetchServerSentEvents('/api/chat'),
})

onDestroy(() => {
  chat.stop()
})
</script>
```

## Next

- [Tools](../tools/tools)
- [Adapters](../adapters/openai)
- [React Quick Start](./quick-start)
