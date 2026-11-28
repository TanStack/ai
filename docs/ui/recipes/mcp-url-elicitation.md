---
title: Open an MCP URL elicitation
id: ui-recipe-mcp-url-elicitation
order: 6
description: "When an MCP server asks the user to open a URL (auth, payment), show the link and continue the interrupt."
keywords:
  - tanstack ai
  - mcp
  - interrupt
  - url
  - elicitation
---

Some MCP servers ask the user to open a URL (sign-in, payment). The interrupt payload carries that URL. Show the host, get consent, then open it.

You need [MCP Client Input](../../tools/mcp-input) on the server route first.

## Full example (React)

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMcpUrl(metadata: Readonly<Record<string, unknown>> | undefined) {
  const payload = metadata?.['tanstack:interruptPayload']
  if (!isRecord(payload)) return undefined
  // URL mode may arrive as kind 'url', or as a form-shaped request with a url field.
  if (!isRecord(payload.request)) return undefined
  const url = payload.request.url
  if (typeof url !== 'string') return undefined
  return {
    kind: payload.kind,
    message: payload.request.message,
    url,
  }
}

export function McpUrlElicitation() {
  const { interrupts } = useChat({
    threadId: 'thread-1',
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <>
      {interrupts.map((interrupt) => {
        if (!interrupt.id.startsWith('mcp_input_')) return null
        if (interrupt.kind !== 'generic') return null
        const input = readMcpUrl(interrupt.metadata)
        if (!input) return null
        let host = input.url
        try {
          host = new URL(input.url).host
        } catch {
          // keep raw url
        }
        return (
          <div key={interrupt.id}>
            <p>{String(input.message ?? interrupt.message)}</p>
            <p>
              Open <strong>{host}</strong> to continue.
            </p>
            <button
              type="button"
              onClick={() => {
                window.open(input.url, '_blank', 'noopener,noreferrer')
                // Many servers treat accept as "the user opened the link".
                interrupt.resolveInterrupt({ action: 'accept' })
              }}
            >
              Open and continue
            </button>
            <button type="button" onClick={() => interrupt.cancel()}>
              Cancel
            </button>
          </div>
        )
      })}
    </>
  )
}
```

## Solid

Use the same helper with `@tanstack/ai-solid` `useChat`. The interrupt methods are the same.

## Sampling (legacy)

Protocol `2026-07-28` deprecates sampling. If `payload.kind === 'sampling'`, show the request text and send a string reply with `resolveInterrupt(replyText)`, or call `cancel()`. Prefer form or URL elicitation for new servers.

## Form interrupts

For structured forms, see [Answer an MCP form interrupt](./mcp-form-interrupt).
