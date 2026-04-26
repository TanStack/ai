---
title: "Quick Start: Svelte"
id: quick-start-svelte
order: 4
description: "Add a streaming TanStack AI chat component to a SvelteKit app using Svelte 5 runes and the OpenAI adapter."
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

You have a SvelteKit app and want to add AI chat. By the end of this guide, you'll have a streaming chat component powered by TanStack AI and OpenAI.

> **Tip:** If you'd prefer not to sign up with individual AI providers, [OpenRouter](../adapters/openrouter) gives you access to 300+ models with a single API key and is the easiest way to get started.

## Installation

```bash
npm install @tanstack/ai @tanstack/ai-svelte @tanstack/ai-openai
# or
pnpm add @tanstack/ai @tanstack/ai-svelte @tanstack/ai-openai
# or
yarn add @tanstack/ai @tanstack/ai-svelte @tanstack/ai-openai
```

## Server Setup

Create a SvelteKit API route that streams chat responses:

```typescript
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

  const { messages, conversationId } = await request.json()

  try {
    const stream = chat({
      adapter: openaiText('gpt-4o'),
      messages,
      conversationId,
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

> **Tip:** `toServerSentEventsResponse` returns a standard `Response`, so it works with any server that speaks the Web Response API -- SvelteKit, Hono, Cloudflare Workers, etc.

## Client Setup

Create a Svelte 5 component using `createChat`:

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

## Environment Variables

Create a `.env` file with your API key:

```bash
# OpenRouter (recommended -- access 300+ models with one key)
OPENROUTER_API_KEY=sk-or-...

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

Your SvelteKit server reads this key at runtime. Never expose it to the browser.

## Svelte-Specific Notes

**`createChat`, not `useChat`.** The Svelte integration uses `createChat` instead of `useChat` to follow Svelte's naming conventions. The returned object has the same properties as the React and Vue versions (`messages`, `sendMessage`, `isLoading`, `error`, `status`, `stop`, `reload`, `clear`).

**Svelte 5 runes.** The examples above use Svelte 5 runes (`$state`). The `createChat` return object uses reactive getters internally, so `chat.messages` and `chat.isLoading` are reactive without any extra wrappers -- no `.value` like Vue, no signals to unwrap.

**No automatic cleanup.** Unlike the React and Vue integrations, `createChat` does not register automatic cleanup. If your component can unmount while a response is streaming, call `chat.stop()` in an `onDestroy` callback:

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

## That's It!

You now have a working SvelteKit chat application. The `createChat` function handles:

- Message state management
- Streaming responses
- Loading states
- Error handling

## Next Steps

- Learn about [Tools](../tools/tools) to add function calling
- Check out the [Adapters](../adapters/openai) to connect to different providers
- See the [React Quick Start](./quick-start) if you're comparing frameworks
