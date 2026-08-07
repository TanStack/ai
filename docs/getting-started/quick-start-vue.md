---
title: "Quick Start: Vue"
id: quick-start-vue
order: 3
description: "Streaming chat in Vue 3 with useChat and an OpenAI (or OpenRouter) backend."
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

If you need Vue chat → install packages, stream from a backend, wire `useChat` in a component.

Prefer one key for many models → [OpenRouter](../adapters/openrouter).

## 1. Install

```bash
npm install @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai
# or
pnpm add @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai
# or
yarn add @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai
```

## 2. Server

Express example (Fastify, Hono, Nitro work if they return TanStack AI SSE):

```typescript ignore
import express from 'express'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const app = express()
app.use(express.json())

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY not configured' })
    return
  }

  try {
    // `chat()` uses the AG-UI `threadId` for devtools correlation
    // when available — no need to plumb `conversationId` manually.
    const stream = chat({
      adapter: openaiText('gpt-5.5'),
      messages,
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

## 3. `Chat.vue`

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
        v-for="message in messages"
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
        :disabled="isLoading"
      />
      <button type="submit" :disabled="!input.trim() || isLoading">
        Send
      </button>
    </form>
  </div>
</template>
```

## 4. API keys

`.env` or `.env.local` — server only:

```bash
# OpenRouter (recommended — access 300+ models with one key)
OPENROUTER_API_KEY=sk-or-...

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

## Vue notes (when you hit them)

**Script needs `.value`; template unwraps.**

```vue
<script setup lang="ts">
// In script, use .value
if (isLoading.value) { /* ... */ }
const count = messages.value.length
</script>

<template>
  <!-- In template, Vue unwraps the ref automatically — no .value -->
  <span v-if="isLoading">Loading...</span>
  <span>{{ messages.length }} messages</span>
</template>
```

State is `DeepReadonly<ShallowRef<>>`. Unmount stops in-flight requests (`onScopeDispose`). API matches React (`messages`, `sendMessage`, `isLoading`, `error`, `status`, `stop`, `reload`, `clear`) with the ref wrapper.

## Next

- [Tools](../tools/tools)
- [Adapters](../adapters/openai)
- [React Quick Start](./quick-start)
