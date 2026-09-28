---
title: Build an MCP Server
id: mcp-server
order: 5
description: "Serve a tool, a resource, and a prompt from a TanStack Start app. The client keeps those types."
keywords:
  - tanstack ai
  - tutorial
  - mcp
  - mcp server
  - createMCPServer
  - tools
  - resources
  - prompts
  - tanstack start
---

You have a tool, a file, and a prompt. A host cannot call them yet.

This tutorial serves all three from one TanStack Start app. A page in that app calls the server and shows the three results.

The server object keeps the types. `createMCPClient({ server })` checks the tool name, the resource URI, and the prompt arguments. That client calls the server in the same process. It opens no connection, and the server `auth` option does not run.

This tutorial uses React and Start. The short guide is [Serve Tools over HTTP](../mcp/server).

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

Then install these packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-mcp zod

<!-- ::end:tabs -->

## The server and the page

The server file defines the tool, the resource, and the prompt.

The route sends each HTTP request to that server.

The page calls the server and shows the forecast, the guide, and the brief.

## 2. Write the server

Create `src/mcp-server.ts`.

The tool returns the weather for one city. `outputSchema` makes that result a string for the client.

The resource is a short city guide. A host reads that file by URI.

The prompt asks for a one-day plan. A host renders that prompt with a city name.

```ts
import { toolDefinition } from '@tanstack/ai'
import {
  createMCPServer,
  promptDefinition,
  resourceDefinition,
} from '@tanstack/ai-mcp/server'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Get the weather for a city',
  inputSchema: z.object({
    city: z.string(),
  }),
  outputSchema: z.string(),
}).server(async ({ city }) => {
  return `Sunny in ${city}`
})

const cityGuide = resourceDefinition({
  uri: 'file:///city-guide.md',
  name: 'city-guide',
  mimeType: 'text/markdown',
}).read(async () => ({
  text: '# Paris\n\nPack a light jacket.',
}))

const tripBrief = promptDefinition({
  name: 'trip_brief',
  description: 'Write a short trip brief for a city',
  argsSchema: z.object({
    city: z.string(),
  }),
}).render(async ({ city }) => [
  {
    role: 'user',
    content: `Write a one-day plan for ${city}.`,
  },
])

export const server = createMCPServer({
  name: 'travel',
  version: '1.0.0',
  tools: [getWeather],
  resources: [cityGuide],
  prompts: [tripBrief],
})

export function handleMcp(request: Request) {
  return server.fetch(request)
}
```

Create the server once. Export `server`. `handleMcp` calls `fetch` for each request.

`server` carries the tool list, the resource list, and the prompt list. An app that calls the deployed server can use those types with `import type`. [Call the server with types](../mcp/server#call-the-server-with-types) shows how.

## 3. Mount the route

Create `src/routes/api.mcp.ts`. The route path is `/api/mcp`.

`GET` is the spec 2025 stream. `DELETE` closes that session. `POST` carries the JSON-RPC body.

```ts ignore
import { createFileRoute } from '@tanstack/react-router'
import { handleMcp } from '../mcp-server'

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => handleMcp(request),
      POST: ({ request }) => handleMcp(request),
      DELETE: ({ request }) => handleMcp(request),
    },
  },
})
```

## 4. Call the server from the page

Create `src/lib/call-server.ts`.

Pass `server` to `createMCPClient`. The page does not need a model key.

The call is type-safe:

- `get_weather` is the only tool name.
- `city` is a string. The result is a string.
- `file:///city-guide.md` is the only resource URI.
- `trip_brief` is the only prompt name. `city` is a string.

A wrong name is a type error. A number for `city` is a type error.

```ts
import { createServerFn } from '@tanstack/react-start'
import { createMCPClient } from '@tanstack/ai-mcp'
import { server } from '../mcp-server'

export type DeskResult = {
  forecast: string
  guide: string
  brief: string
}

export const callDesk = createServerFn({ method: 'POST' }).handler(
  async (): Promise<DeskResult> => {
    const client = await createMCPClient({ server })
    const forecast = await client.callTool('get_weather', { city: 'Paris' })
    const guide = await client.readResource('file:///city-guide.md')
    const prompt = await client.getPrompt('trip_brief', { city: 'Paris' })
    const message = prompt[0]
    return {
      forecast,
      guide: guide.text,
      brief: message === undefined ? '' : message.content,
    }
  },
)
```

Create `src/routes/index.tsx`. The button calls `callDesk`.

```tsx ignore
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { callDesk } from '@/lib/call-server'
import type { DeskResult } from '@/lib/call-server'

function McpServerPage() {
  const [result, setResult] = useState<DeskResult | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onCall() {
    setError('')
    setPending(true)
    try {
      setResult(await callDesk())
    } catch (caught) {
      setResult(null)
      setError(caught instanceof Error ? caught.message : 'The call failed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-3xl font-bold text-white">Travel desk</h1>
      <p className="mb-6 text-gray-300">
        This page calls your MCP server. The server has one tool, one resource,
        and one prompt.
      </p>
      <button
        type="button"
        className="rounded bg-white px-4 py-2 font-semibold text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
        disabled={pending}
        onClick={() => {
          void onCall()
        }}
      >
        {pending ? 'The call is in progress' : 'Call the server'}
      </button>
      {error !== '' ? (
        <p className="mt-4 text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {result !== null ? (
        <div className="mt-8 space-y-6 text-gray-100">
          <section>
            <h2 className="text-xl font-semibold">Forecast</h2>
            <p>{result.forecast}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold">City guide</h2>
            <pre className="whitespace-pre-wrap">{result.guide}</pre>
          </section>
          <section>
            <h2 className="text-xl font-semibold">Trip brief</h2>
            <p>{result.brief}</p>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export const Route = createFileRoute('/')({
  component: McpServerPage,
})
```

## 5. Run the app

1. In the app folder, run `pnpm dev`.
2. Open the URL that the dev server prints. The default is http://localhost:3000.
3. Click Call the server.

The page shows `Sunny in Paris`, the city guide, and the trip brief.

<!-- ::client-example library=ai framework=react slug=mcp-server -->

The full example is on GitHub: [TanStack/ai `examples/react/mcp-server`](https://github.com/TanStack/ai/tree/main/examples/react/mcp-server).

If the tool must ask the user, open [Ask for Input](../mcp/server-input).

If a tool returns before the work ends, open [MCP Server Tasks](../mcp/server-tasks).

If the server must require a bearer token, open [MCP Server Auth](../mcp/server-auth).
