---
title: Basic Chat
id: basic-chat
order: 1
description: "Build a streaming React chat in a TanStack Start app. The user pastes an OpenRouter key in the tab, and useChat streams tokens from a server route."
keywords:
  - tanstack ai
  - tutorial
  - basic chat
  - useChat
  - byok
  - openrouter
  - tanstack start
---

This tutorial builds a chat that streams tokens. The provider key stays in the browser for the demo.

The user pastes an OpenRouter key, and `useChat` sends it to a server route. It takes about 10 minutes.

This tutorial uses React and TanStack Start. For other frameworks, open [Quick Start](../getting-started/quick-start). To skip the setup, paste a key in the sandbox in step 5.

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

Install the TanStack AI packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openrouter

<!-- ::end:tabs -->

Get an OpenRouter key from [openrouter.ai](https://openrouter.ai).

## 2. Keep the key in the tab

Create `src/lib/byok.ts`. `memoryStorage()` keeps the key in this tab only.

```typescript
import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [openrouterByok],
})
```

Create `src/components/open-router-key-form.tsx`. `byok.update` saves the key. `useByok` reads the status.

```tsx ignore
import { useState } from 'react'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { useByok } from '@tanstack/ai-react'
import { byok } from '@/lib/byok'

export function OpenRouterKeyForm() {
  const snapshot = useByok(byok)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const status = snapshot.status[openrouterByok.id]
  const masked = status && 'masked' in status ? status.masked : undefined
  const missingKey = snapshot.prompt?.reason === 'missing'

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const next = draft.trim()
        if (!next) return
        setError('')
        void byok
          .update(openrouterByok.id, next)
          .then(() => setDraft(''))
          .catch((caught: unknown) =>
            setError(
              caught instanceof Error ? caught.message : 'Could not save key',
            ),
          )
      }}
    >
      <input
        type="password"
        autoComplete="off"
        placeholder={masked ? `Saved ${masked}` : 'Paste your OpenRouter key'}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit" disabled={!draft.trim()}>
        Save key
      </button>
      {missingKey ? (
        <p>Paste an OpenRouter key, then send again.</p>
      ) : null}
      {error ? <p>{error}</p> : null}
    </form>
  )
}
```

For passkeys or other storage, open [Bring Your Own Key](../advanced/byok).

## 3. Add the chat page

Replace `src/routes/index.tsx` with this file. Pass `byok` to `useChat`. The hook then sends the key in an `x-byok-*` header.

```tsx ignore
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  fetchServerSentEvents,
  useChat,
} from '@tanstack/ai-react'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { byok } from '@/lib/byok'

function ChatPage() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
    byok,
  })

  const handleSendMessage = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div>
      <OpenRouterKeyForm />
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) =>
            part.type === 'text' ? <p key={index}>{part.content}</p> : null,
          )}
        </div>
      ))}
      {error ? <p>{error.message}</p> : null}
      {isLoading ? (
        <button type="button" onClick={stop}>
          Stop
        </button>
      ) : null}
      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        disabled={isLoading}
      />
      <button
        type="button"
        onClick={handleSendMessage}
        disabled={!input.trim() || isLoading}
      >
        Send
      </button>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
```

## 4. Add the server route

Create `src/routes/api.chat.ts`, next to `index.tsx`. Start maps this file name to the `/api/chat` path.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequest(request)
  const apiKey = getByokKey(request, openrouterByok)
  if (!apiKey) return byokMissing(openrouterByok)

  const stream = chat({
    adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
  })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

Import `openrouterByok` from `@tanstack/ai-openrouter/byok`, not from the main entry of the adapter.

## 5. Try it

1. Run the app.
2. Paste an OpenRouter key.
3. Send a message.

Tokens stream into the page. Click Stop to cancel the reply.

The same app is on the Examples tab at `/ai/latest/docs/framework/react/examples/basic-chat`.

<!-- ::client-example library=ai framework=react slug=basic-chat -->

You have a streaming chat, and the OpenRouter key never sits in a server env file.

## How it works

A chat has two sides:

- **The client** runs in the browser. It holds the key, shows the messages, and sends a POST to your route.
- **The server route** reads the key, calls OpenRouter, and streams the tokens back.

On the client:

- `useChat` keeps `messages` up to date as tokens arrive.
- If no key is saved, the hook does not send the POST. The form shows "Paste an OpenRouter key, then send again."

On the server:

- `getByokKey` reads the `x-byok-openrouter` header first. If the header is empty, it reads `OPENROUTER_API_KEY` from the environment.
- If both are empty, `byokMissing` returns HTTP 401.
- `toServerSentEventsResponse` turns the `chat()` stream into a Server-Sent Events response.

The full example is on GitHub: [TanStack/ai `examples/react/basic-chat`](https://github.com/TanStack/ai/tree/main/examples/react/basic-chat).

Next, pick one:

- A headless chat UI: [A chat box with no tools](../ui/recipes/basic-chat).
- An image from a prompt: [Generate Image](./generate-image).
- A table that fills as JSON streams: [Streaming Structured Table](./streaming-structured-table).
