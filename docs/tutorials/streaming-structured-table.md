---
title: Streaming Structured Table
id: streaming-structured-table
order: 2
description: "Stream a typed table from chat({ outputSchema, stream: true }). useChat exposes partial.rows. The UI fills as JSON arrives."
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

You want a table that fills while the model writes JSON. If you wait for the full object, the UI stays empty.

Pass `outputSchema` and `stream: true` to `chat()`. Pass the same schema to `useChat`. Show `partial.rows` as table rows.

This tutorial is React + Start. For other frameworks, open [Quick Start](../getting-started/quick-start).

You can skip the scaffold and paste a key in the sandbox at the end of this page.

If you already built [Basic Chat](./basic-chat), keep the key form. Then skip to the schema.

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

Then install the TanStack AI packages and Zod:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openrouter zod

<!-- ::end:tabs -->

Get an OpenRouter key from [openrouter.ai](https://openrouter.ai).

## Client and server

A structured table has two sides.

The **client** holds the key, sends the prompt, and shows rows from `partial`.

The **server** route reads that key, calls OpenRouter with the schema, and streams JSON back.

The next steps share one schema. Then they save the key. Then they show the table. Then they add the route.

## 2. Share a schema

Create `src/lib/table-schema.ts`. The client and the server import this file. Field descriptions tell the model what to put in each column.

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

## 3. Set up BYOK on the client

Create `src/lib/byok.ts`. `memoryStorage()` keeps the key in this tab.

```typescript
import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [openrouterByok],
})
```

Create `src/components/open-router-key-form.tsx`. Export `OpenRouterKeyForm` from that file. If you already have this form from Basic Chat, reuse it.

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

## 4. Show the table from `partial`

Open `src/routes/index.tsx`. Import `OpenRouterKeyForm` from `@/components/open-router-key-form`. Pass `byok` and `outputSchema: tableSchema` to `useChat`.

The server streams JSON text in chunks. The hook parses that incomplete JSON into `partial`. Fields show up as soon as they parse. A new row can have empty cells until more text arrives.

`final` is the completed object. It stays `null` until the stream ends. If you only read `final`, the table stays empty until the run is done.

Show `partial.rows` while the model writes. Use `final` when you need the complete object, for example to save it.

Missing cells show `…` until that field arrives.

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

A send with no key does not POST. The form shows "Paste an OpenRouter key, then send again."

## 5. Add the server route

Create `src/routes/api.chat.ts` in the `src/routes` folder, next to `index.tsx`. Start maps that file name to the `/api/chat` path.

`getByokKey` reads the `x-byok-openrouter` header, then `OPENROUTER_API_KEY` in the environment. If both are empty, `byokMissing` returns HTTP 401.

Pass `outputSchema: tableSchema` and `stream: true`. Wrap `chat()` with `toServerSentEventsResponse`.

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

Import `openrouterByok` from `@tanstack/ai-openrouter/byok`, not from the adapter main entry.

Run the app. Paste an OpenRouter key. Send `Compare 6 JavaScript frameworks`. Rows appear as the JSON streams.

The same app is on the Examples tab at `/ai/latest/docs/framework/react/examples/streaming-structured-table`.

<!-- ::client-example library=ai framework=react slug=streaming-structured-table -->

You have a table that fills from streamed structured output. The OpenRouter key never sits in a server env file.

The full example is on GitHub: [TanStack/ai `examples/react/streaming-structured-table`](https://github.com/TanStack/ai/tree/main/examples/react/streaming-structured-table).

For the API details, open [Streaming UIs](../structured-outputs/streaming).
