---
title: "Quick Start: Octane"
id: quick-start-octane
order: 5
description: "Add a streaming TanStack AI chat component to an Octane app using the useChat hook and the OpenAI adapter."
keywords:
  - tanstack ai
  - octane
  - quick start
  - useChat
  - streaming chat
  - openai
  - tsrx
---

You have an Octane app and want AI chat. At the end of this page you have a streaming chat component powered by TanStack AI.

> **Tip:** If you do not want a key per provider, [OpenRouter](../adapters/openrouter) gives you 300+ models with one API key.

## 1. Install

```bash
npm install @tanstack/ai @tanstack/ai-octane @tanstack/ai-openai octane
# or
pnpm add @tanstack/ai @tanstack/ai-octane @tanstack/ai-openai octane
```

`@tanstack/ai-octane` publishes uncompiled `.tsrx` source. Your Octane plugin compiles it. Add `octane/compiler/vite` (or the rspack / rspeedy equivalent) to the app build.

## 2. Stream from the server

Any backend that returns TanStack AI SSE works. This Express handler is one:

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

`chat()` uses the AG-UI `threadId` for devtools correlation when the client sends one.

## 3. Call `useChat` in Octane

```tsx ignore
import { useState } from 'octane'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-octane'

export function Chat() @{
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

  <div>
    @for (const message of messages; key message.id) {
      <div>
        <strong>{message.role === 'assistant' ? 'Assistant' : 'You'}</strong>
        <p>
          {message.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.content)
            .join('')}
        </p>
      </div>
    }
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
}
```

`useChat` does not own the text box. Hold the value in `useState` and pass it to `sendMessage`. Octane text controls fire `onInput`, not a synthetic `onChange`.

## 4. Put the API key on the server

```bash
# OpenRouter (one key, many models)
OPENROUTER_API_KEY=sk-or-...

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

The server reads this key. Do not send it to the browser.

## Octane notes

- **Uncompiled source.** The package has no `dist`. The Octane compiler must see `@tanstack/ai-octane`.
- **Same hook names as React.** `useChat`, `useGeneration`, `useAudioRecorder`, and the rest. Change the import path from `@tanstack/ai-react` to `@tanstack/ai-octane`.
- **Cleanup is automatic.** The hook calls `attach()` on mount and `detach()` plus `dispose()` on unmount.

## Next

- [Octane API](../api/ai-octane) for options, queue, interrupts, and tools
- [Tools](../tools/tools) for function calling
- [Adapters](../adapters/openai) for other providers
