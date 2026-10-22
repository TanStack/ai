---
title: Streaming Structured Table
id: streaming-structured-table
order: 2
description: "Stream a typed table from chat({ outputSchema, stream: true }). useChat gives you partial.rows, so the table fills while the JSON arrives."
keywords:
  - tanstack ai
  - tutorial
  - structured output
  - streaming
  - useChat
  - outputSchema
  - table
  - openrouter
  - tanstack start
---

This tutorial streams typed table rows. `partial.rows` updates while the model writes the JSON.

Pass one schema to `chat()` on the server and to `useChat` on the client. The hook gives you `partial.rows` while the JSON streams, so rows show up as the model writes them. It takes about 10 minutes.

This tutorial uses React and TanStack Start. For other frameworks, open [Quick Start](../getting-started/quick-start). To skip the setup, paste a key in the sandbox in step 5.

If you already built [Basic Chat](./basic-chat), keep the app and the key form. Install `zod`, then go to step 2.

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

Install the TanStack AI packages and Zod:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openrouter zod

<!-- ::end:tabs -->

Get an OpenRouter key from [openrouter.ai](https://openrouter.ai).

## 2. Share one schema

Create `src/lib/table-schema.ts`. The client and the server both import this file. The field descriptions tell the model what to put in each column.

```typescript
import { z } from 'zod'

export const tableSchema = z.object({
  title: z.string().meta({ description: 'Short title for the table' }),
  rows: z.array(
    z.object({
      name: z.string().meta({ description: 'Row name' }),
      year: z.number().meta({ description: 'First release year' }),
      kind: z.string().meta({ description: 'Category or paradigm' }),
      note: z.string().meta({ description: 'One-line typical use' }),
    }),
  ),
})
```

## 3. Keep the key in the tab

Create `src/lib/byok.ts`. `memoryStorage()` keeps the key in this tab only.

```typescript
import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [openrouterByok],
})
```

Create `src/components/open-router-key-form.tsx`. If you have this form from Basic Chat, use it again.

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

## 4. Show the table from `partial`

Replace `src/routes/index.tsx` with this file. Pass `byok` and `outputSchema: tableSchema` to `useChat`. Then show `partial.rows` as table rows.

```tsx ignore
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { byok } from '@/lib/byok'
import { tableSchema } from '@/lib/table-schema'

function TablePage() {
  const [input, setInput] = useState('')
  const { sendMessage, isLoading, error, stop, partial, final } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
    byok,
    outputSchema: tableSchema,
  })

  const rows = partial.rows ?? []
  const title = partial.title

  const handleSendMessage = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div>
      <h1>Streaming structured table</h1>
      <OpenRouterKeyForm />
      {rows.length === 0 && !isLoading ? (
        <p>Paste an OpenRouter key. Then ask for a comparison table.</p>
      ) : (
        <table aria-busy={isLoading}>
          <caption>
            {title ?? 'Results'}
            {isLoading ? ' (streaming)' : final ? ' (complete)' : ''}
          </caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Year</th>
              <th scope="col">Kind</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <th scope="row">{row.name ?? '…'}</th>
                <td>{row.year ?? '…'}</td>
                <td>{row.kind ?? '…'}</td>
                <td>{row.note ?? '…'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error ? <p>{error.message}</p> : null}
      {isLoading ? (
        <button type="button" onClick={stop}>
          Stop
        </button>
      ) : null}
      <label htmlFor="table-prompt">Prompt</label>
      <textarea
        id="table-prompt"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Compare 6 JavaScript frameworks"
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
  component: TablePage,
})
```

A cell shows `…` until its field arrives.

## 5. Add the server route

Create `src/routes/api.chat.ts`, next to `index.tsx`. Start maps this file name to the `/api/chat` path. Pass `outputSchema: tableSchema` and `stream: true` to `chat()`.

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
import { tableSchema } from '@/lib/table-schema'

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequest(request)
  const apiKey = getByokKey(request, openrouterByok)
  if (!apiKey) return byokMissing(openrouterByok)

  const stream = chat({
    adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    outputSchema: tableSchema,
    stream: true,
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

Then try it:

1. Run the app.
2. Paste an OpenRouter key.
3. Send `Compare 6 JavaScript frameworks`.

Rows show up while the JSON streams.

The same app is on the Examples tab at `/ai/latest/docs/framework/react/examples/streaming-structured-table`.

<!-- ::client-example library=ai framework=react slug=streaming-structured-table -->

You have a table that fills from streamed structured output, and the OpenRouter key never sits in a server env file.

## How it works

The server streams the JSON text in chunks. The hook parses that incomplete JSON into `partial`:

- A field shows up in `partial` as soon as it parses.
- A new row can have empty cells until more text arrives.
- `final` is the complete object. It stays `null` until the stream ends.

Show `partial.rows` while the model writes. Use `final` when you need the complete object, for example to save it. If you read only `final`, the table stays empty until the run is done.

On the server, `getByokKey` reads the `x-byok-openrouter` header first. If the header is empty, it reads `OPENROUTER_API_KEY` from the environment. If both are empty, `byokMissing` returns HTTP 401. If no key is saved in the tab, the hook does not send the POST, and the form shows "Paste an OpenRouter key, then send again."

The full example is on GitHub: [TanStack/ai `examples/react/streaming-structured-table`](https://github.com/TanStack/ai/tree/main/examples/react/streaming-structured-table).

For the API details, open [Streaming UIs](../structured-outputs/streaming).
