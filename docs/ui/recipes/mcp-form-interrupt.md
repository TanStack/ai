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

## Full example (React)

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

export function McpFormInterrupt() {
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
        const request = readMcpForm(interrupt.metadata)
        if (!request) return null
        return (
          <form
            key={interrupt.id}
            onSubmit={(event) => {
              event.preventDefault()
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
      })}
    </>
  )
}
```

## Solid

Use the same `readMcpForm` helper with `useChat` from `@tanstack/ai-solid`. The interrupt API is the same: `resolveInterrupt` and `cancel`.

## What to send

- Accept: `{ value: string }` for a `createMCPServer` form (or the object that matches `requestedSchema`).
- Decline: `{ action: 'decline' }`.
- Cancel: `interrupt.cancel()`.

## URL elicitation

If `payload.kind` is not `form`, see [URL elicitation](./mcp-url-elicitation).
