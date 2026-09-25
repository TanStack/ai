---
title: MCP Client Input
id: mcp-input
order: 12
description: "When an MCP server asks for input, chat() pauses so the UI can show the request and send the answer."
keywords:
  - tanstack ai
  - mcp
  - interrupt
  - form
  - sampling
---

An MCP server can stop a tool call. The server asks for input.

- A form needs an answer from the user.
- A sampling request needs a model reply.

You want that request in the UI, and you want the answer to reach the server. `chat()` ends the run with an interrupt. `outcome.type` is `interrupt`. The payload has `kind` and `request`. When the user answers, the next run calls the tool again with the answer.

## Read the pause

Pass the MCP client to `chat()` in `mcp.clients`. [MCP Server Tools](./mcp) has that setup.

The stream ends on one `RUN_FINISHED` chunk. Read the interrupt there:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Ask the server' }]

const mcp = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://my-mcp-server.example.com/mcp',
  },
})

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  mcp: { clients: [mcp] },
})

for await (const chunk of stream) {
  if (chunk.type !== 'RUN_FINISHED') continue
  if (chunk.outcome?.type !== 'interrupt') continue

  for (const interrupt of chunk.outcome.interrupts) {
    if (interrupt.reason !== 'mcp_input') continue
    const payload = interrupt.metadata?.['tanstack:interruptPayload']
    console.log(interrupt.id, payload)
  }
}
```

The pause follows these rules:

- The input call has no tool result.
- The run does not emit `RUN_ERROR`.
- When other tools finish in that turn, the stream has those results.

The interrupt has these fields:

- `id`: `mcp_input_` and the tool call id
- `reason`: `mcp_input`
- `message`: `Input required to run` and the tool name
- `metadata.toolName`: the tool name
- `metadata['tanstack:interruptPayload']`: `kind` and `request`

`kind` is `form` or `sampling`. `request` is the MCP input body.

## Answer the request

The answer comes back in a new request. Pass `parentRunId` and `resume` from that request to `chat()`:

```ts
// app/api/chat/route.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const mcp = await createMCPClient({
    transport: {
      type: 'http',
      url: 'https://my-mcp-server.example.com/mcp',
    },
  })

  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
    mcp: { clients: [mcp] },
  })
  return toServerSentEventsResponse(stream)
}
```

Then answer the request in the UI:

1. Read `interrupts` from `useChat`.
2. Find the item where `reason` is `mcp_input`.
3. Read `metadata['tanstack:interruptPayload']` and show the request.
4. Call `resolveInterrupt` with the answer, or call `cancel()`.

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMcpInput(
  metadata: Readonly<Record<string, unknown>> | undefined,
) {
  const payload = metadata?.['tanstack:interruptPayload']
  if (!isRecord(payload)) return undefined
  const kind = payload.kind
  if (kind !== 'form' && kind !== 'sampling') return undefined
  if (!isRecord(payload.request)) return undefined
  return { kind, request: payload.request }
}

export function McpInputPrompt() {
  const [answer, setAnswer] = useState('')
  const { interrupts } = useChat({
    threadId: 'thread-1',
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <>
      {interrupts.map((interrupt) => {
        if (interrupt.reason !== 'mcp_input') return null
        if (interrupt.kind !== 'generic') return null
        const input = readMcpInput(interrupt.metadata)
        if (!input) return null
        return (
          <form
            key={interrupt.id}
            onSubmit={(event) => {
              event.preventDefault()
              interrupt.resolveInterrupt({ value: answer })
            }}
          >
            <label>
              {String(input.request.message ?? interrupt.message)}
              <input
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
              />
            </label>
            <button type="submit">Send</button>
            <button type="button" onClick={() => interrupt.cancel()}>
              Cancel
            </button>
          </form>
        )
      })}
    </>
  )
}
```

`useChat` sends the answer in a new run. Then `chat()` runs the tool again, and the MCP client sends the answer to the server.

## What to send

The answer depends on `kind`.

- `form`: send an object that matches `request.requestedSchema`. A server from `createMCPServer` asks for `{ value: string }`. The MCP client sends the object as the accepted content.
- `sampling`: send the model reply as a string. You can also send a full MCP `CreateMessageResult`.
- `cancel()`: for a form, the server gets `{ action: 'cancel' }`. A `createMCPServer` tool then ends with a tool error. For a sampling request, the tool call ends with an error.

To decline a form, send the full MCP answer: `{ action: 'decline' }`.

A resumed tool gets the answer on `ctx.inputResponse`. The MCP tools read it for you. Your own server tool can read it too.

The client answers one input request per tool call. If the server asks for input again after it gets the answer, the tool call ends with a tool error.

The pause and the resume work on spec 2026. On spec 2025, the server asks the client for input in the middle of the tool call. `chat()` cannot pause that call, so the tool call fails.

## A tool error

If the thrown value is a plain `Error`, the result is a tool error. The run does not pause.

`chat()` pauses only for this shape:

- `name`: `MCPInputRequiredError`
- `kind`: `form` or `sampling`
- `request`: the MCP input body

## Outside chat()

Outside `chat()`, the client throws `MCPInputRequiredError`. The name `ask` is the tool name on your server.

1. Call `tools()` on the MCP client.
2. Call `execute` on the tool.
3. Check the error with `isMCPInputRequiredError`, then read `kind` and `request`.
4. Close the client after the call.

```ts
import { createMCPClient, isMCPInputRequiredError } from '@tanstack/ai-mcp'

export async function callAsk() {
  const mcp = await createMCPClient({
    transport: {
      type: 'http',
      url: 'https://my-mcp-server.example.com/mcp',
    },
  })

  try {
    const tools = await mcp.tools()
    const ask = tools.find((tool) => tool.name === 'ask')
    if (!ask?.execute) return
    await ask.execute({})
  } catch (error) {
    if (!isMCPInputRequiredError(error)) throw error
    console.log(error.kind, error.request)
  } finally {
    await mcp.close()
  }
}
```
