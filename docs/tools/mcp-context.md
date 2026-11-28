---
title: Attach MCP resources and prompts
id: mcp-context
order: 9
description: "Put MCP resources and prompts into chat() with attachResources and prompts. No manual converters."
keywords:
  - tanstack ai
  - mcp
  - resources
  - prompts
  - attachResources
---

Pass `attachResources` and `prompts` on `chat({ mcp })`. The run reads them before the first model call.

You need [MCP Server Tools](./mcp) working first.

## Attach a resource

1. Give `chat()` the MCP client and the resource URI:

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://my-mcp-server.example.com/mcp',
  },
})

const stream = chat({
  // Latest OpenAI chat models take text + image. Attach an image resource here.
  // For a PDF (`application/pdf` → document part), pick a model whose
  // `supports.input` includes `document`.
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Describe this chart.' }],
  threadId: 'thread-1',
  mcp: {
    clients: [mcp],
    attachResources: { uris: ['file:///charts/q3.png'] },
  },
})

return toServerSentEventsResponse(stream)
```

2. Ask the model about the image. The resource is already on the last user message.

### Auto-pick resources

Use the first resources the server lists:

```ts
mcp: {
  clients: [mcp],
  attachResources: { auto: true, max: 3 },
}
```

Default `max` is `8`.

### Blob types

`attachResources` uses the same mapping as `mcpResourceToContentPart`:

| `mimeType` | Part |
| --- | --- |
| `image/*` | image |
| `audio/*` | audio |
| `text/*` | text (decoded from the blob) |
| `application/pdf` | document |
| missing or other | text placeholder (or omit / throw) |

Control size and reject policy:

```ts
mcp: {
  clients: [mcp],
  attachResources: { uris: ['file:///photo.png'] },
  resourcePartOptions: {
    maxBytes: 2_000_000,
    onReject: 'omit', // 'placeholder' | 'omit' | 'throw'
  },
}
```

## Prepend an MCP prompt

```ts
mcp: {
  clients: [mcp],
  prompts: { name: 'summarize-doc', args: { tone: 'short' } },
}
```

Pass an array for more than one prompt. Prompt messages go at the start of the conversation.

## Slash-style prompts in the UI

1. Expose the prompt list from a small API route:

```ts
// api/mcp-prompts.ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: process.env.MCP_URL! },
})

export async function GET() {
  const prompts = await mcp.prompts()
  return Response.json(prompts)
}
```

2. On the chat server, read the prompt from `forwardedProps` (where
`fetchServerSentEvents({ body })` puts it) and return SSE:

```ts
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const { messages, threadId, forwardedProps } =
  await chatParamsFromRequest(request)
const promptName = forwardedProps.promptName
const promptArgs = forwardedProps.promptArgs

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId,
  mcp: {
    clients: [mcp],
    ...(typeof promptName === 'string'
      ? {
          prompts: {
            name: promptName,
            args: isRecord(promptArgs) ? promptArgs : undefined,
          },
        }
      : {}),
  },
})

return toServerSentEventsResponse(stream)
```

3. In the client, send the prompt the user picked (and its args). `useChat` streams the SSE answer into `messages`:

```tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

// From your prompt picker + argument form (not hard-coded to prompts[0]).
const selectedPromptName = userSelectedPrompt.name
const promptArgs = userSelectedPromptArgs

export function ChatWithPrompt() {
  const { messages, sendMessage } = useChat({
    threadId: 'thread-1',
    connection: fetchServerSentEvents('/api/chat', {
      body: {
        promptName: selectedPromptName,
        promptArgs,
      },
    }),
  })

  return (
    <button
      type="button"
      onClick={() => void sendMessage('Run with the selected prompt')}
    >
      Send
    </button>
  )
}
```

## Cap tools from many servers

```ts
mcp: {
  clients: [pool],
  maxTools: 12,
  rankTools: 'annotation', // prefer readOnlyHint
}
```

Tools after the cap stay available through lazy discovery (`LazyToolManager`).

## Manual path

To read a resource yourself and build messages by hand, use [Manual MCP](./mcp-manual).
