---
title: MCP Client Input
id: mcp-input
order: 12
description: "When an MCP server asks for input during a tool call, chat() pauses so the UI can show the request and send the answer."
keywords:
  - tanstack ai
  - mcp
  - interrupt
  - form
  - sampling
---

Sometimes an MCP server stops a tool call and asks for input. It needs one of these:

- A form that the user fills in.
- A sampling request that needs a model reply.

You want to show that request in your UI and send the answer back to the server. `chat()` does this with an interrupt: the run pauses, the UI answers, and the next run calls the tool again with the answer.

## Quick setup

You need [MCP Server Tools](./mcp) working first, with the client in `mcp.clients`.

1. In your chat route, pass `parentRunId` and `resume` from the request to `chat()`:

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
    adapter: openaiText('gpt-6.1-sol'),
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

2. In the UI, read `interrupts` from `useChat`. For each MCP input interrupt, show the request and call `resolveInterrupt` with the answer, or call `cancel()`:

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
        if (!interrupt.id.startsWith('mcp_input_')) return null
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

Try it. When a tool asks for input, the form shows the question from the server. Type an answer and click **Send**. The tool call continues with your answer.

## How it works

1. The MCP server asks for input during a tool call.
2. `chat()` ends the run with an interrupt. `outcome.type` is `interrupt`, and the interrupt id starts with `mcp_input_`.
3. `useChat` shows the interrupt. The user answers.
4. `useChat` sends the answer in a new run.
5. `chat()` runs the tool again, and the MCP client sends the answer to the server.

The pause and the resume work on spec 2026. On spec 2025, the server asks the client for input in the middle of the tool call. `chat()` cannot pause that call, so the tool call fails.

## What to send

The answer depends on the `kind` of the request.

- `form`: send an object that matches `request.requestedSchema`. A server from `createMCPServer` asks for `{ value: string }`. The MCP client sends the object as the accepted content.
- `sampling`: send the model reply as a string. You can also send a full MCP `CreateMessageResult`.
- `cancel()`: for a form, the server gets `{ action: 'cancel' }`. A `createMCPServer` tool then ends with a tool error. For a sampling request, the tool call ends with an error.

To decline a form, send the full MCP answer: `{ action: 'decline' }`.

## Advanced

### Read the pause on the server

The stream ends with one `RUN_FINISHED` chunk. You can read the interrupt there:

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
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  mcp: { clients: [mcp] },
})

for await (const chunk of stream) {
  if (chunk.type !== 'RUN_FINISHED') continue
  if (chunk.outcome?.type !== 'interrupt') continue

  for (const interrupt of chunk.outcome.interrupts) {
    if (!interrupt.id.startsWith('mcp_input_')) continue
    const payload = interrupt.metadata?.['tanstack:interruptPayload']
    console.log(interrupt.id, payload)
  }
}
```

During the pause:

- The input call has no tool result.
- The run does not emit `RUN_ERROR`.
- When other tools finish in the same turn, the stream has their results.

### Interrupt fields

| Field | Value |
|---|---|
| `id` | `mcp_input_` and the tool call id. Find the pause by this id. |
| `reason` | Display text. The default is `mcp_input`. See the rules below. |
| `message` | `Input required to run` and the tool name. |
| `metadata.toolName` | The tool name. |
| `metadata['tanstack:interruptPayload']` | `kind` and `request`. `kind` is `form` or `sampling`. `request` is the MCP input body. |

Rules for `reason`:

- A tool can set another string, for example `auth_required`.
- An empty reason stays `mcp_input`.
- These reasons also stay `mcp_input`: `approval_required`, `client_tool_input`, and `tanstack:client_tool_execution`.

### Answers on the resumed tool

- A resumed tool gets the answer on `ctx.inputResponse`. The MCP tools read it for you. Your own server tool can read it too.
- The client answers one input request for each tool call. If the server asks for input again after it gets the answer, the tool call ends with a tool error.

### Which errors pause the run

If a tool throws a plain `Error`, the result is a tool error. The run does not pause.

`chat()` pauses only for a thrown value with this shape:

- `name`: `MCPInputRequiredError`
- `kind`: `form` or `sampling`
- `request`: the MCP input body
- `reason` (optional): the `reason` of the interrupt. The default is `'mcp_input'`.

A tool can throw this shape with its own `reason`, for example `auth_required`. The interrupt id stays `mcp_input_<toolCallId>`, and the resume uses the same id. `reason` is only display text, so find the pause by its id.

### Outside chat()

Outside `chat()`, the client throws `MCPInputRequiredError`. In this sample, `ask` is the tool name on your server.

1. Call `tools()` on the MCP client.
2. Call `execute` on the tool.
3. Test the error with `isMCPInputRequiredError`, then read `kind` and `request`.
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
