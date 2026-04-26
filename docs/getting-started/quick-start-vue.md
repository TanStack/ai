---
title: "Quick Start: Vue"
id: quick-start-vue
order: 3
description: "Build a streaming TanStack AI chat component in a Vue 3 app using the useChat composable and the OpenAI adapter."
keywords:
  - tanstack ai
  - vue
  - vue 3
  - quick start
  - useChat
  - streaming chat
  - openai
  - composable
---

You have a Vue 3 app and want to add AI chat. By the end of this guide, you'll have a streaming chat component powered by TanStack AI and OpenAI.

> **Tip:** If you'd prefer not to sign up with individual AI providers, [OpenRouter](../adapters/openrouter) gives you access to 300+ models with a single API key and is the easiest way to get started.

## Installation

```bash
npm install @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai
# or
pnpm add @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai
# or
yarn add @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai
```

## Server Setup

Vue apps typically use a separate backend. Here's an Express server that streams chat responses:

```typescript
import express from 'express'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const app = express()
app.use(express.json())

app.post('/api/chat', async (req, res) => {
  const { messages, conversationId } = req.body

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY not configured' })
    return
  }

  try {
    const stream = chat({
      adapter: openaiText('gpt-4o'),
      messages,
      conversationId,
    })

    const response = toServerSentEventsResponse(stream)
    res.writeHead(response.status, Object.fromEntries(response.headers))

    const body = response.body
    if (body) {
      const reader = body.getReader()
      const pump = async () => {
        const { done, value } = await reader.read()
        if (done) {
          res.end()
          return
        }
        res.write(value)
        await pump()
      }
      await pump()
    }
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'An error occurred',
    })
  }
})

app.listen(3000, () => console.log('Server running on port 3000'))
```

> **Tip:** Any backend that returns the TanStack AI SSE format works -- you can use Fastify, Hono, Nitro, or any other Node.js framework.

## Client Setup

Create a `Chat.vue` component using the `useChat` composable:

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
  <div class="chat">
    <div class="messages">
      <div
        v-for="message in messages.value"
        :key="message.id"
        :class="message.role"
      >
        <strong>{{ message.role === 'assistant' ? 'Assistant' : 'You' }}</strong>
        <div v-for="(part, idx) in message.parts" :key="idx">
          <p v-if="part.type === 'text'">{{ part.content }}</p>
        </div>
      </div>
    </div>

    <form @submit.prevent="handleSubmit">
      <input
        v-model="input"
        placeholder="Type a message..."
        :disabled="isLoading.value"
      />
      <button type="submit" :disabled="!input.trim() || isLoading.value">
        Send
      </button>
    </form>
  </div>
</template>
```

## Environment Variables

Create a `.env` file (or `.env.local` depending on your setup) with your API key:

```bash
# OpenRouter (recommended — access 300+ models with one key)
OPENROUTER_API_KEY=sk-or-...

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

Your server reads this key at runtime. Never expose it to the browser.

## Vue-Specific Notes

**Reactive state uses `ShallowRef`.** The `useChat` composable returns state wrapped in `DeepReadonly<ShallowRef<>>`. Access values with `.value` in both `<script>` and `<template>`:

```vue
<script setup lang="ts">
// In script, use .value
if (isLoading.value) { /* ... */ }
const count = messages.value.length
</script>

<template>
  <!-- In template, also use .value (these are ShallowRefs, not regular refs) -->
  <span v-if="isLoading.value">Loading...</span>
  <span>{{ messages.value.length }} messages</span>
</template>
```

**Automatic cleanup.** The composable calls `onScopeDispose` internally, so in-flight requests are stopped when the component unmounts. No manual cleanup needed.

**Same API shape as React.** If you're coming from `@tanstack/ai-react`, the Vue composable returns the same properties (`messages`, `sendMessage`, `isLoading`, `error`, `status`, `stop`, `reload`, `clear`). The only difference is the `ShallowRef` wrapper.

## That's It!

You now have a working Vue chat application. The `useChat` composable handles:

- Message state management
- Streaming responses
- Loading states
- Error handling

## Next Steps

- Learn about [Tools](../tools/tools) to add function calling
- Check out the [Adapters](../adapters/openai) to connect to different providers
- See the [React Quick Start](./quick-start) if you're comparing frameworks
