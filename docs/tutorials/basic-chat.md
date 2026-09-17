---
title: Basic Chat
id: basic-chat
order: 1
description: "Create a TanStack Start app, then add a streaming React chat. BYOK holds the OpenRouter key in the tab. useChat talks to a server route that streams tokens."
keywords:
  - tanstack ai
  - tutorial
  - basic chat
  - useChat
  - byok
  - openrouter
  - tanstack start
---

Create a TanStack Start app. Then add a streaming chat.

This tutorial is React + Start. For other frameworks, open [Quick Start](../getting-started/quick-start).

You can skip the scaffold and paste a key in the sandbox at the end of this page.

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

Then install the TanStack AI packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openrouter

<!-- ::end:tabs -->

Get an OpenRouter key from [openrouter.ai](https://openrouter.ai).

## Client and server

A chat has two sides.

The **client** runs in the browser. It holds the key, draws messages, and POSTs to your route.

The **server** route reads that key, calls OpenRouter, and streams tokens back.

The next steps build the client. Then they add the route.

## 2. Set up BYOK on the client

Create `src/lib/byok.ts`. `memoryStorage()` keeps the key in this tab.

```typescript
import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [openrouterByok],
})
```

Create `src/components/open-router-key-form.tsx`. Export `OpenRouterKeyForm` from that file. `byok.update` saves the key. `useByok` reads the status.

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

If you want passkeys, open [Bring Your Own Key](../advanced/byok).

## 3. Hook up `useChat`

Open `src/routes/index.tsx`. Import `OpenRouterKeyForm` from `@/components/open-router-key-form`. Pass `byok` to `useChat`. The hook sends the key in an `x-byok-*` header.

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

`messages` updates as tokens arrive. Click Stop to cancel.

A send with no key does not POST. The form shows "Paste an OpenRouter key, then send again."

## 4. Add the server route

Create `src/routes/api.chat.ts` in the `src/routes` folder, next to `index.tsx`. Start maps that file name to the `/api/chat` path. Do this in two steps.

### Read the key

`getByokKey` reads the `x-byok-openrouter` header, then `OPENROUTER_API_KEY` in the environment. If both are empty, `byokMissing` returns HTTP 401.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import { chatParamsFromRequest } from '@tanstack/ai'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequest(request)
  const apiKey = getByokKey(request, openrouterByok)
  if (!apiKey) return byokMissing(openrouterByok)

  return new Response('ok')
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

This is a stub. The next step replaces the `ok` body.

Import `openrouterByok` from `@tanstack/ai-openrouter/byok`, not from the adapter main entry.

### Call `chat` and return the stream

Replace the `ok` response. Pass the key into `createOpenRouterText`. Wrap `chat()` with `toServerSentEventsResponse`.

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

## 5. Try it

Run the app. Paste an OpenRouter key. Send a message. Tokens stream into the UI.

The same app is on the Examples tab at `/ai/latest/docs/framework/react/examples/basic-chat`.

<!-- ::client-example library=ai framework=react slug=basic-chat -->

You have a streaming chat. The OpenRouter key never sits in a server env file.

The full example is on GitHub: [TanStack/ai `examples/react/basic-chat`](https://github.com/TanStack/ai/tree/main/examples/react/basic-chat).

For a headless chat UI, open [A chat box with no tools](../ui/recipes/basic-chat).

For an image from a prompt, open [Generate Image](./generate-image).

For a table that fills as JSON streams, open [Streaming Structured Table](./streaming-structured-table).
