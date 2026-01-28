---
id: chat
title: chat
---

# Function: chat()

```ts
function chat<TAdapter, TSchema, TStream>(options): TextActivityResult<TSchema, TStream>;
```

Defined in: [activities/chat/index.ts:1015](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/index.ts#L1015)

Text activity - handles agentic text generation, one-shot text generation, and agentic structured output.

This activity supports four modes:
1. **Streaming agentic text**: Stream responses with automatic tool execution
2. **Streaming one-shot text**: Simple streaming request/response without tools
3. **Non-streaming text**: Returns collected text as a string (stream: false)
4. **Agentic structured output**: Run tools, then return structured data

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AnyTextAdapter`](../type-aliases/AnyTextAdapter.md)

### TSchema

`TSchema` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined` = `undefined`

### TStream

`TStream` *extends* `boolean` = `true`

## Parameters

### options

`TextActivityOptions`\<`TAdapter`, `TSchema`, `TStream`\>

## Returns

`TextActivityResult`\<`TSchema`, `TStream`\>

## Examples

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

for await (const chunk of chat({
  adapter: openaiText('gpt-4o'),
  messages: [{ role: 'user', content: 'What is the weather?' }],
  tools: [weatherTool]
})) {
  if (chunk.type === 'content') {
    console.log(chunk.delta)
  }
}
```

```ts
for await (const chunk of chat({
  adapter: openaiText('gpt-4o'),
  messages: [{ role: 'user', content: 'Hello!' }]
})) {
  console.log(chunk)
}
```

```ts
const text = await chat({
  adapter: openaiText('gpt-4o'),
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: false
})
// text is a string with the full response
```

```ts
import { z } from 'zod'

const result = await chat({
  adapter: openaiText('gpt-4o'),
  messages: [{ role: 'user', content: 'Research and summarize the topic' }],
  tools: [researchTool, analyzeTool],
  outputSchema: z.object({
    summary: z.string(),
    keyPoints: z.array(z.string())
  })
})
// result is { summary: string, keyPoints: string[] }
```
