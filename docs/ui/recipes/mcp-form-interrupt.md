---
title: Answer an MCP form interrupt
id: ui-recipe-mcp-form-interrupt
order: 5
description: "Show the form an MCP server asks for during a tool call, then resolve the interrupt."
keywords:
  - tanstack ai
  - mcp
  - interrupt
  - form
  - elicitation
---

When an MCP server pauses a tool for a form, `chat()` ends the run with an interrupt whose id starts with `mcp_input_`. Show the form and call `resolveInterrupt`.

You need [MCP Client Input](../../tools/mcp-input) on the server route first (`parentRunId` + `resume`).

This example assumes the form schema has a string `value` property (the default for `createMCPServer` forms). For other schemas, render and submit the properties that `requestedSchema` lists.

## Full example (React)

`sendMessage` starts the run on this same `useChat` instance so interrupts arrive here.

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMcpForm(metadata: Readonly<Record<string, unknown>> | undefined) {
  const payload = metadata?.['tanstack:interruptPayload']
  if (!isRecord(payload) || payload.kind !== 'form') return undefined
  if (!isRecord(payload.request)) return undefined
  return payload.request
}

type ChatInterrupt = {
  id: string
  kind: string
  message: string
  metadata?: Readonly<Record<string, unknown>>
  resolveInterrupt: (value: unknown) => void
  cancel: () => void
}

function McpFormCard({ interrupt }: { interrupt: ChatInterrupt }) {
  const [answer, setAnswer] = useState('')
  const request = readMcpForm(interrupt.metadata)
  if (!request) return null

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        // Matches a schema with a string `value` property.
        interrupt.resolveInterrupt({ value: answer })
      }}
    >
      <label>
        {String(request.message ?? interrupt.message)}
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
}

export function McpFormInterrupt() {
  const { interrupts, sendMessage } = useChat({
    threadId: 'thread-1',
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <>
      <button
        type="button"
        onClick={() => void sendMessage('Please ask me for the form')}
      >
        Start
      </button>
      {interrupts.map((interrupt) => {
        if (!interrupt.id.startsWith('mcp_input_')) return null
        if (interrupt.kind !== 'generic') return null
        return <McpFormCard key={interrupt.id} interrupt={interrupt} />
      })}
    </>
  )
}
```

Each form keeps its own answer state in `McpFormCard`, so two interrupts do not share one input.

## Solid

Use the same `readMcpForm` helper with `useChat` from `@tanstack/ai-solid`. The interrupt API is the same: `resolveInterrupt` and `cancel`.

## What to send

- Accept: `{ value: string }` for a `createMCPServer` form (or the object that matches `requestedSchema`).
- Decline: `{ action: 'decline' }`.
- Cancel: `interrupt.cancel()`.

## URL elicitation

If `payload.kind` is not `form`, see [URL elicitation](./mcp-url-elicitation).
