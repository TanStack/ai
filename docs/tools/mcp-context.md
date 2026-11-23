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
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Summarize this document.' }],
  threadId: 'thread-1',
  mcp: {
    clients: [mcp],
    attachResources: { uris: ['file:///reports/q3.pdf'] },
  },
})

return toServerSentEventsResponse(stream)
```

2. Ask the model about the document. The PDF (or image, or text) is already on the last user message.

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
| `application/pdf` or `text/*` | document |
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

List prompts on the server, then send the chosen name in your chat body. On the server, map that name to `mcp.prompts`:

```ts
// api/chat.ts
const { messages, threadId, promptName, promptArgs } = await request.json()

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId,
  mcp: {
    clients: [mcp],
    ...(typeof promptName === 'string'
      ? { prompts: { name: promptName, args: promptArgs } }
      : {}),
  },
})
```

In the UI, show `await mcp.prompts()` (from a small API route) as `/`-commands. When the user picks one, put `promptName` on the next request.

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
